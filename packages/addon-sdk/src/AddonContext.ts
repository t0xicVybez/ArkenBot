

import type { Client } from 'discord.js';
import type { AddonStorage, AddonLogger, AddonMessages, LocaleResolvable } from './types.js';
import type { AddonEventBus } from './AddonEventBus.js';

const DEFAULT_LOCALE = 'en-US';

function lookup(msgs: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!msgs) return undefined;
  let cur: unknown = msgs;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export class AddonContext {
  public readonly addonName: string;
  public readonly client: Client;
  public readonly storage: AddonStorage;
  public readonly logger: AddonLogger;
  public readonly events: AddonEventBus;

  public readonly db?: unknown;

  private _getSettings: (guildId: string) => Promise<Record<string, unknown>>;
  private _isInstalled?: (guildId: string) => Promise<boolean>;
  private _messages: AddonMessages;
  private _resolveLocale?: (arg: LocaleResolvable) => Promise<string>;

  constructor(options: {
    addonName: string;
    client: Client;
    storage: AddonStorage;
    logger: AddonLogger;
    events: AddonEventBus;

    db?: unknown;
    getSettings: (guildId: string) => Promise<Record<string, unknown>>;

    isInstalled?: (guildId: string) => Promise<boolean>;

    messages?: AddonMessages;

    resolveLocale?: (arg: LocaleResolvable) => Promise<string>;
  }) {
    this.addonName = options.addonName;
    this.client = options.client;
    this.storage = options.storage;
    this.logger = options.logger;
    this.events = options.events;
    this.db = options.db;
    this._getSettings = options.getSettings;
    this._isInstalled = options.isInstalled;
    this._messages = options.messages ?? {};
    this._resolveLocale = options.resolveLocale;
  }

  t(key: string, locale: string, vars?: Record<string, string | number>): string {
    let str =
      lookup(this._messages[locale], key) ??
      lookup(this._messages[DEFAULT_LOCALE], key) ??
      key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, 'g'), String(v));
      }
    }
    return str;
  }

  async resolveLocale(arg: LocaleResolvable): Promise<string> {
    if (!this._resolveLocale) return DEFAULT_LOCALE;
    return this._resolveLocale(arg);
  }

  async getSettings(guildId: string): Promise<Record<string, unknown>> {
    return this._getSettings(guildId);
  }

  async isInstalled(guildId: string): Promise<boolean> {
    return this._isInstalled ? this._isInstalled(guildId) : true;
  }

  async getSetting<T = unknown>(guildId: string, key: string, defaultValue?: T): Promise<T> {
    const settings = await this._getSettings(guildId);
    return (settings[key] ?? defaultValue) as T;
  }

  getGuild(guildId: string) {
    return this.client.guilds.cache.get(guildId);
  }
}
