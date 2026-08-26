/**
 * Discovers, loads, and manages the lifecycle of addon packages from the addons
 * directory. Each addon is auto-registered in the database on first load; no
 * manual portal registration is required.
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotClient } from '../client.js';
import type { BotCommand } from '../types.js';
import type { AddonDefinition } from '@arkenbot/addon-sdk';
import { AddonContext } from '@arkenbot/addon-sdk';
import { AddonEventBus } from '@arkenbot/addon-sdk';
import { prisma } from '../database.js';
import { logger } from '../logger.js';
import { resolveUserLocale } from '../i18n/index.js';
import { ADDON_CATEGORY_PREFIX } from '@arkenbot/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Provides key-value persistence for a single addon scoped to either a specific
 * guild or globally (no guild). Backed by the `AddonData` Prisma model.
 */
class AddonStorage {
  constructor(private addonDbId: string) {}

  /**
   * Retrieves a stored value for the given key.
   * @param key - Storage key.
   * @param guildId - Guild scope. Omit for global (cross-guild) data.
   */
  async get<T>(key: string, guildId?: string): Promise<T | null> {
    // `findUnique` cannot match a null column in a composite unique index, so
    // global records (guildId IS NULL) must be fetched with `findFirst`.
    const record = guildId
      ? await prisma.addonData.findUnique({
          where: { guildId_addonId_key: { guildId, addonId: this.addonDbId, key } },
        })
      : await prisma.addonData.findFirst({
          where: { guildId: null, addonId: this.addonDbId, key },
        });
    return record ? (record.value as T) : null;
  }

  /**
   * Stores or updates a value for the given key.
   * @param key - Storage key.
   * @param value - Value to persist. Must be JSON-serialisable.
   * @param guildId - Guild scope. Omit for global (cross-guild) data.
   */
  async set<T>(key: string, value: T, guildId?: string): Promise<void> {
    if (guildId) {
      await prisma.addonData.upsert({
        where: { guildId_addonId_key: { guildId, addonId: this.addonDbId, key } },
        update: { value: value as object },
        create: { guildId, addonId: this.addonDbId, key, value: value as object },
      });
    } else {
      // Global records have guildId = null and no Guild foreign key, so upsert
      // requires a two-step find-then-update/create.
      const existing = await prisma.addonData.findFirst({
        where: { guildId: null, addonId: this.addonDbId, key },
        select: { id: true },
      });
      if (existing) {
        await prisma.addonData.update({ where: { id: existing.id }, data: { value: value as object } });
      } else {
        await prisma.addonData.create({ data: { guildId: null, addonId: this.addonDbId, key, value: value as object } });
      }
    }
  }

  /**
   * Deletes the stored value for the given key.
   * @param key - Storage key to remove.
   * @param guildId - Guild scope. Omit to target global records.
   */
  async delete(key: string, guildId?: string): Promise<void> {
    await prisma.addonData.deleteMany({
      where: { guildId: guildId ?? null, addonId: this.addonDbId, key },
    });
  }

  /**
   * Returns all keys stored for this addon in the given scope.
   * @param guildId - Guild scope. Omit to list global keys.
   */
  async keys(guildId?: string): Promise<string[]> {
    const records = await prisma.addonData.findMany({
      where: { guildId: guildId ?? null, addonId: this.addonDbId },
      select: { key: true },
    });
    return records.map((r) => r.key);
  }
}

/**
 * Wraps the application logger with a fixed `addon` field so that all messages
 * emitted by an addon are identifiable in structured log output.
 */
class AddonLogger {
  constructor(private addonName: string) {}

  info(message: string, ...args: unknown[]) {
    logger.info({ addon: this.addonName }, message, ...args);
  }
  warn(message: string, ...args: unknown[]) {
    logger.warn({ addon: this.addonName }, message, ...args);
  }
  error(message: string, ...args: unknown[]) {
    logger.error({ addon: this.addonName }, message, ...args);
  }
  debug(message: string, ...args: unknown[]) {
    logger.debug({ addon: this.addonName }, message, ...args);
  }
}

/** Internal record for a successfully activated addon. */
interface LoadedAddon {
  definition: AddonDefinition;
  context: AddonContext;
  eventBus: AddonEventBus;
  /** Cleanup functions collected during activation; called on deactivation. */
  unsubscribers: Array<() => void>;
}

/** Discovers, loads, activates, and deactivates addon packages at runtime. */
export class AddonHandler {
  private client: BotClient;
  private loadedAddons = new Map<string, LoadedAddon>();
  private sharedEventBus = new AddonEventBus();

  constructor(client: BotClient) {
    this.client = client;
  }

  /**
   * Scans the addons directory and loads every subdirectory that contains a
   * built `dist/index.js`. Silently skips the directory if it does not exist.
   */
  async loadAddons(): Promise<void> {
    const addonsDir = resolve(__dirname, '..', '..', '..', '..', 'addons');

    if (!existsSync(addonsDir)) {
      logger.info('No addons directory found, skipping');
      return;
    }

    const addonFolders = readdirSync(addonsDir).filter((dir) =>
      statSync(join(addonsDir, dir)).isDirectory()
    );

    for (const folder of addonFolders) {
      await this.loadAddon(join(addonsDir, folder));
    }

    logger.info(`Loaded ${this.loadedAddons.size} addons`);
  }

  /**
   * Loads and activates a single addon from its directory path. The addon's
   * manifest is upserted into the database so the staff portal always reflects
   * the current on-disk state — placing a new addon folder and restarting the
   * bot is all that is needed to register it.
   */
  async loadAddon(addonPath: string): Promise<void> {
    try {
      const indexPath = join(addonPath, 'dist', 'index.js');

      if (!existsSync(indexPath)) {
        logger.warn(`Skipping addon at ${addonPath} — no dist/index.js found (run pnpm build inside the addon)`);
        return;
      }

      const fileUrl = pathToFileURL(indexPath).href;
      const module = await import(fileUrl);
      const definition: AddonDefinition = module.default;

      if (!definition?.manifest?.name) {
        logger.warn(`Addon at ${addonPath} has no manifest`);
        return;
      }

      const { name } = definition.manifest;

      const dbAddon = await prisma.addon.upsert({
        where: { name },
        update: {
          displayName: definition.manifest.displayName,
          version: definition.manifest.version,
          description: definition.manifest.description,
          author: definition.manifest.author,
          homepage: definition.manifest.homepage ?? null,
          manifest: definition.manifest as object,
        },
        create: {
          name,
          displayName: definition.manifest.displayName,
          version: definition.manifest.version,
          description: definition.manifest.description,
          author: definition.manifest.author,
          homepage: definition.manifest.homepage ?? null,
          enabled: true,
          verified: false,
          manifest: definition.manifest as object,
        },
      });

      if (!dbAddon.enabled) {
        logger.info(`Addon ${name} is disabled in the database, skipping`);
        return;
      }

      await this.activateAddon(definition, dbAddon.id);
    } catch (err) {
      logger.error({ err, addonPath }, 'Failed to load addon');
    }
  }

  /**
   * Wires up an addon's commands, events, and lifecycle hooks, then registers
   * it in the loaded-addon map. Called internally by `loadAddon`.
   */
  async activateAddon(definition: AddonDefinition, dbAddonId: string): Promise<void> {
    const { name } = definition.manifest;
    const eventBus = new AddonEventBus();

    const context = new AddonContext({
      addonName: name,
      client: this.client,
      storage: new AddonStorage(dbAddonId),
      logger: new AddonLogger(name),
      events: eventBus,
      getSettings: async (guildId: string) => {
        const guildAddon = await prisma.guildAddon.findUnique({
          where: { guildId_addonId: { guildId, addonId: dbAddonId } },
        });
        return (guildAddon?.settings as Record<string, unknown>) ?? {};
      },
      // Wire the addon's own localized catalogs and the shared locale resolver so
      // `ctx.t()` / `ctx.resolveLocale()` reply in the viewer's language.
      messages: definition.locales,
      resolveLocale: resolveUserLocale,
    });

    const unsubscribers: Array<() => void> = [];

    if (definition.commands) {
      for (const cmd of definition.commands) {
        const botCommand: BotCommand = {
          data: cmd.data as BotCommand['data'],
          category: `${ADDON_CATEGORY_PREFIX}${name}`,
          execute: (interaction, _client) => cmd.execute(interaction, context),
          autocomplete: cmd.autocomplete
            ? (interaction, _client) => cmd.autocomplete!(interaction, context)
            : undefined,
        };
        // Core (built-in) commands take precedence: never let an addon shadow a
        // command name that a first-party command already owns (e.g. the demo
        // example-economy addon vs. the real /balance, /pay, /daily).
        const existing = this.client.commands.get(cmd.data.name);
        if (existing && !existing.category?.startsWith(ADDON_CATEGORY_PREFIX)) {
          logger.warn(`Addon ${name} command "${cmd.data.name}" ignored — a core command already owns that name`);
          continue;
        }
        this.client.commands.set(cmd.data.name, botCommand);
        logger.debug(`Registered addon command: ${cmd.data.name} from ${name}`);
      }
    }

    if (definition.events) {
      for (const eventDef of definition.events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = (...args: any[]) => {
          const result = (eventDef.handler as (...a: any[]) => Promise<void>)(context, ...args);
          result.catch((err) =>
            logger.error({ err, addon: name, event: eventDef.event }, 'Addon event handler error'),
          );
        };

        if (eventDef.once) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.client.once(eventDef.event, handler as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unsubscribers.push(() => this.client.off(eventDef.event, handler as any));
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.client.on(eventDef.event, handler as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unsubscribers.push(() => this.client.off(eventDef.event, handler as any));
        }
      }
    }

    if (definition.hooks?.onLoad) {
      await definition.hooks.onLoad(context);
    }

    this.loadedAddons.set(name, { definition, context, eventBus, unsubscribers });
    logger.info(`Activated addon: ${name} v${definition.manifest.version}`);
  }

  /**
   * Runs the addon's `onUnload` hook, removes its event listeners and commands,
   * and evicts it from the loaded-addon map.
   */
  async deactivateAddon(name: string): Promise<void> {
    const loaded = this.loadedAddons.get(name);
    if (!loaded) return;

    if (loaded.definition.hooks?.onUnload) {
      await loaded.definition.hooks.onUnload(loaded.context);
    }

    for (const unsub of loaded.unsubscribers) {
      unsub();
    }

    if (loaded.definition.commands) {
      for (const cmd of loaded.definition.commands) {
        this.client.commands.delete(cmd.data.name);
      }
    }

    this.loadedAddons.delete(name);
    logger.info(`Deactivated addon: ${name}`);
  }

  /** Returns the names of all currently active addons. */
  getLoadedAddons(): string[] {
    return Array.from(this.loadedAddons.keys());
  }

  /**
   * Forwards updated guild settings to an addon's `onSettingsUpdate` hook.
   * Called by the API whenever a staff member saves addon settings in the portal.
   */
  async notifySettingsUpdate(addonName: string, guildId: string, settings: Record<string, unknown>): Promise<void> {
    const loaded = this.loadedAddons.get(addonName);
    if (loaded?.definition.hooks?.onSettingsUpdate) {
      await loaded.definition.hooks.onSettingsUpdate(loaded.context, guildId, settings);
    }
  }
}
