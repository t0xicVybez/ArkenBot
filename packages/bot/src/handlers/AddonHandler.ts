/**
 * Discovers, loads, and manages first-party addons.
 *
 * Addons live in the top-level `addons/` folder and each ship a compiled
 * `dist/index.js` that default-exports an `AddonDefinition` (a manifest plus
 * optional commands, event listeners and lifecycle hooks). On startup we find
 * every addon, register it in the database, and wire up whatever it provides.
 *
 * Each addon runs with an `AddonContext` — a small, sandboxed toolkit giving it
 * scoped storage, a logger, an event bus and its per-guild settings — so addon
 * code never touches the database or client directly.
 */
import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotClient } from '../client.js';
import type { BotCommand } from '../types.js';
import type { AddonDefinition } from '@arkenbot/addon-sdk';
import { AddonContext } from '@arkenbot/addon-sdk';
import { AddonEventBus } from '@arkenbot/addon-sdk';
import { randomUUID } from 'crypto';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

// Lua run atomically on Redis to release a lock only if we still own it: compare
// the stored token to ours and delete only on a match. This prevents releasing
// a lock that already expired and was re-acquired by someone else.
const RELEASE_LOCK = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
import { resolveUserLocale } from '../i18n/index.js';
import { ADDON_CATEGORY_PREFIX } from '@arkenbot/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Key-value storage handed to a single addon. Values are JSON stored in the
 * `AddonData` table, scoped either to one guild or globally (no guild).
 */
class AddonStorage {
  constructor(private addonDbId: string) {}

  async get<T>(key: string, guildId?: string): Promise<T | null> {
    // A composite unique index can't match a NULL column, so global records
    // (guildId = null) are fetched with findFirst rather than findUnique.
    const record = guildId
      ? await prisma.addonData.findUnique({
          where: { guildId_addonId_key: { guildId, addonId: this.addonDbId, key } },
        })
      : await prisma.addonData.findFirst({
          where: { guildId: null, addonId: this.addonDbId, key },
        });
    return record ? (record.value as T) : null;
  }

  async set<T>(key: string, value: T, guildId?: string): Promise<void> {
    if (guildId) {
      await prisma.addonData.upsert({
        where: { guildId_addonId_key: { guildId, addonId: this.addonDbId, key } },
        update: { value: value as object },
        create: { guildId, addonId: this.addonDbId, key, value: value as object },
      });
    } else {
      // Same NULL-guild limitation as above: upsert can't key on a null column,
      // so do the find-then-update-or-create by hand.
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
   * Read a value, transform it, and write it back — all under a short Redis lock
   * so two concurrent mutations of the same key can't overwrite each other (for
   * example, two tickets opening at the same instant both bumping a counter).
   */
  async mutate<T>(key: string, mutator: (current: T | null) => T | Promise<T>, guildId?: string): Promise<T> {
    const lockKey = `addonlock:${this.addonDbId}:${guildId ?? 'global'}:${key}`;
    const token = randomUUID();
    const acquired = await this.acquireLock(lockKey, token);
    try {
      const current = await this.get<T>(key, guildId);
      const next = await mutator(current);
      await this.set(key, next, guildId);
      return next;
    } finally {
      // Only release the lock if we actually took it, and only if it's still
      // ours (the Lua check above).
      if (acquired) {
        await redis.eval(RELEASE_LOCK, 1, lockKey, token).catch(() => undefined);
      }
    }
  }

  /**
   * Try to take the lock, retrying briefly if it's held. Best-effort: if we
   * can't get it within the wait window we proceed anyway (logged) so a stuck
   * lock never deadlocks an addon — the small risk of a lost update is better
   * than hanging forever.
   */
  private async acquireLock(lockKey: string, token: string): Promise<boolean> {
    const LOCK_TTL_MS = 5000; // the lock auto-expires so a crash can't hold it
    const MAX_WAIT_MS = 3000; // how long we'll wait for a busy lock
    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const ok = await redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX').catch(() => null);
      if (ok === 'OK') return true;
      if (Date.now() >= deadline) {
        logger.warn(`AddonStorage: lock contention on ${lockKey}; proceeding without lock`);
        return false;
      }
      // Wait a short, slightly randomised moment before retrying so competing
      // waiters don't all wake at once.
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 40)));
    }
  }

  async delete(key: string, guildId?: string): Promise<void> {
    await prisma.addonData.deleteMany({
      where: { guildId: guildId ?? null, addonId: this.addonDbId, key },
    });
  }

  async keys(guildId?: string): Promise<string[]> {
    const records = await prisma.addonData.findMany({
      where: { guildId: guildId ?? null, addonId: this.addonDbId },
      select: { key: true },
    });
    return records.map((r) => r.key);
  }
}

/** A thin logger wrapper that stamps every line with the addon's name. */
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

/** Everything we keep in memory about one running addon. */
interface LoadedAddon {
  definition: AddonDefinition;
  context: AddonContext;
  eventBus: AddonEventBus;
  // Called on unload to detach each gateway listener we registered.
  unsubscribers: Array<() => void>;
}

// Reference/example addons shipped for documentation only — never loaded.
const RETIRED_ADDONS = new Set(['example-economy']);

export class AddonHandler {
  private client: BotClient;
  private loadedAddons = new Map<string, LoadedAddon>();
  private sharedEventBus = new AddonEventBus();

  constructor(client: BotClient) {
    this.client = client;
  }

  /** Walk the addons directory and load each one. */
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
      if (RETIRED_ADDONS.has(folder)) {
        logger.info(`Skipping retired reference addon: ${folder}`);
        continue;
      }
      await this.loadAddon(join(addonsDir, folder));
    }

    logger.info(`Loaded ${this.loadedAddons.size} addons`);
  }

  /** Load a single addon from its folder, registering/refreshing it in the DB. */
  async loadAddon(addonPath: string): Promise<void> {
    try {
      const indexPath = join(addonPath, 'dist', 'index.js');

      // Addons run from their compiled output; skip any that haven't been built.
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

      // Keep the database's record of this addon in sync with its manifest,
      // creating the row the first time we ever see it.
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

      // An operator can disable an addon globally by flipping this flag.
      if (!dbAddon.enabled) {
        logger.info(`Addon ${name} is disabled in the database, skipping`);
        return;
      }

      await this.activateAddon(definition, dbAddon.id);
    } catch (err) {
      // A single broken addon must never take down the whole bot.
      logger.error({ err, addonPath }, 'Failed to load addon');
    }
  }

  /** Wire an addon's commands, events and hooks into the running client. */
  async activateAddon(definition: AddonDefinition, dbAddonId: string): Promise<void> {
    const { name } = definition.manifest;
    const eventBus = new AddonEventBus();

    // The sandboxed toolkit the addon sees. Everything it needs to touch the
    // outside world goes through here.
    const context = new AddonContext({
      addonName: name,
      client: this.client,
      storage: new AddonStorage(dbAddonId),
      logger: new AddonLogger(name),
      events: eventBus,
      db: prisma,
      getSettings: async (guildId: string) => {
        const guildAddon = await prisma.guildAddon.findUnique({
          where: { guildId_addonId: { guildId, addonId: dbAddonId } },
        });
        return (guildAddon?.settings as Record<string, unknown>) ?? {};
      },
      isInstalled: async (guildId: string) => {
        const ga = await prisma.guildAddon.findUnique({
          where: { guildId_addonId: { guildId, addonId: dbAddonId } },
          select: { enabled: true },
        });
        return Boolean(ga?.enabled);
      },

      messages: definition.locales,
      resolveLocale: resolveUserLocale,
    });

    const unsubscribers: Array<() => void> = [];

    if (definition.commands) {
      for (const cmd of definition.commands) {
        // Adapt the addon's command shape to the bot's, injecting the addon
        // context so its execute/autocomplete receive their toolkit.
        const botCommand: BotCommand = {
          data: cmd.data as BotCommand['data'],
          category: `${ADDON_CATEGORY_PREFIX}${name}`,
          execute: (interaction, _client) => cmd.execute(interaction, context),
          autocomplete: cmd.autocomplete
            ? (interaction, _client) => cmd.autocomplete!(interaction, context)
            : undefined,
        };

        // Core commands win: an addon may not shadow a built-in command name.
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
        // Discord.js event signatures vary per event, so the wrapper takes any
        // args and forwards them to the addon's handler.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = (...args: any[]) => {
          const result = (eventDef.handler as (...a: unknown[]) => Promise<void>)(context, ...args);
          result.catch((err) => {
            // An autocomplete interaction expires the moment the user types
            // another character, so a 10062 "Unknown interaction" when replying
            // to one is harmless noise, not a real error.
            const isAutocomplete = args.some((a) => typeof a?.isAutocomplete === 'function' && a.isAutocomplete());
            if (isAutocomplete && (err as { code?: number })?.code === 10062) {
              logger.debug({ addon: name, event: eventDef.event }, 'autocomplete interaction expired (10062) — ignored');
              return;
            }
            logger.error({ err, addon: name, event: eventDef.event }, 'Addon event handler error');
          });
        };

        // Register the listener and remember how to remove it again on unload.
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

    // Let the addon run any one-time setup.
    if (definition.hooks?.onLoad) {
      await definition.hooks.onLoad(context);
    }

    this.loadedAddons.set(name, { definition, context, eventBus, unsubscribers });
    logger.info(`Activated addon: ${name} v${definition.manifest.version}`);
  }

  /** Tear an addon back down: run its onUnload hook, detach listeners, drop commands. */
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

  getLoadedAddons(): string[] {
    return Array.from(this.loadedAddons.keys());
  }

  /** Called when a guild changes an addon's settings in the dashboard. */
  async notifySettingsUpdate(addonName: string, guildId: string, settings: Record<string, unknown>): Promise<void> {
    const loaded = this.loadedAddons.get(addonName);
    if (loaded?.definition.hooks?.onSettingsUpdate) {
      await loaded.definition.hooks.onSettingsUpdate(loaded.context, guildId, settings);
    }
  }
}
