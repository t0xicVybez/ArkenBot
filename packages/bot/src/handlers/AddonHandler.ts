

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

const RELEASE_LOCK = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
import { resolveUserLocale } from '../i18n/index.js';
import { ADDON_CATEGORY_PREFIX } from '@arkenbot/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

class AddonStorage {
  constructor(private addonDbId: string) {}

  async get<T>(key: string, guildId?: string): Promise<T | null> {

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
      if (acquired) {
        await redis.eval(RELEASE_LOCK, 1, lockKey, token).catch(() => undefined);
      }
    }
  }

  private async acquireLock(lockKey: string, token: string): Promise<boolean> {
    const LOCK_TTL_MS = 5000;
    const MAX_WAIT_MS = 3000;
    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const ok = await redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX').catch(() => null);
      if (ok === 'OK') return true;
      if (Date.now() >= deadline) {
        logger.warn(`AddonStorage: lock contention on ${lockKey}; proceeding without lock`);
        return false;
      }
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

interface LoadedAddon {
  definition: AddonDefinition;
  context: AddonContext;
  eventBus: AddonEventBus;

  unsubscribers: Array<() => void>;
}

const RETIRED_ADDONS = new Set(['example-economy']);

export class AddonHandler {
  private client: BotClient;
  private loadedAddons = new Map<string, LoadedAddon>();
  private sharedEventBus = new AddonEventBus();

  constructor(client: BotClient) {
    this.client = client;
  }

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

  async activateAddon(definition: AddonDefinition, dbAddonId: string): Promise<void> {
    const { name } = definition.manifest;
    const eventBus = new AddonEventBus();

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
        const botCommand: BotCommand = {
          data: cmd.data as BotCommand['data'],
          category: `${ADDON_CATEGORY_PREFIX}${name}`,
          execute: (interaction, _client) => cmd.execute(interaction, context),
          autocomplete: cmd.autocomplete
            ? (interaction, _client) => cmd.autocomplete!(interaction, context)
            : undefined,
        };

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
          const result = (eventDef.handler as (...a: unknown[]) => Promise<void>)(context, ...args);
          result.catch((err) => {

            const isAutocomplete = args.some((a) => typeof a?.isAutocomplete === 'function' && a.isAutocomplete());
            if (isAutocomplete && (err as { code?: number })?.code === 10062) {
              logger.debug({ addon: name, event: eventDef.event }, 'autocomplete interaction expired (10062) — ignored');
              return;
            }
            logger.error({ err, addon: name, event: eventDef.event }, 'Addon event handler error');
          });
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

  async notifySettingsUpdate(addonName: string, guildId: string, settings: Record<string, unknown>): Promise<void> {
    const loaded = this.loadedAddons.get(addonName);
    if (loaded?.definition.hooks?.onSettingsUpdate) {
      await loaded.definition.hooks.onSettingsUpdate(loaded.context, guildId, settings);
    }
  }
}
