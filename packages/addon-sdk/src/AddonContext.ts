/**
 * Runtime context injected into every addon command handler, event handler, and lifecycle hook.
 * Provides scoped access to the Discord client, persistent storage, structured logging,
 * the inter-addon event bus, and per-guild settings.
 */

import type { Client } from 'discord.js';
import type { AddonStorage, AddonLogger, AddonMessages, LocaleResolvable } from './types.js';
import type { AddonEventBus } from './AddonEventBus.js';

const DEFAULT_LOCALE = 'en-US';

/** Resolve a dot-path key against a nested message catalog. */
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

  private _getSettings: (guildId: string) => Promise<Record<string, unknown>>;
  private _messages: AddonMessages;
  private _resolveLocale?: (arg: LocaleResolvable) => Promise<string>;

  constructor(options: {
    addonName: string;
    client: Client;
    storage: AddonStorage;
    logger: AddonLogger;
    events: AddonEventBus;
    getSettings: (guildId: string) => Promise<Record<string, unknown>>;
    /** Localized catalogs declared by the addon (locale -> nested dict). */
    messages?: AddonMessages;
    /** Host-provided locale resolver (reads the user's saved preference, etc.). */
    resolveLocale?: (arg: LocaleResolvable) => Promise<string>;
  }) {
    this.addonName = options.addonName;
    this.client = options.client;
    this.storage = options.storage;
    this.logger = options.logger;
    this.events = options.events;
    this._getSettings = options.getSettings;
    this._messages = options.messages ?? {};
    this._resolveLocale = options.resolveLocale;
  }

  /**
   * Translate a dot-path `key` into `locale` using this addon's declared catalogs.
   * Interpolates `{name}` placeholders from `vars`. Falls back requested locale ->
   * `en-US` -> the key itself, so a missing translation is visible but never throws.
   */
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

  /**
   * Resolve which language to reply in for a given interaction (or event-derived
   * `{ user, guildId, guildLocale }`). Delegates to the host resolver, which reads
   * the user's saved `arken_locale` preference, then Discord locale, then guild
   * settings. Falls back to `en-US` when no resolver is wired.
   */
  async resolveLocale(arg: LocaleResolvable): Promise<string> {
    if (!this._resolveLocale) return DEFAULT_LOCALE;
    return this._resolveLocale(arg);
  }

  /**
   * Returns all addon settings configured for the given guild.
   * Returns an empty object if no settings have been saved.
   *
   * @param guildId - The Discord guild snowflake ID.
   */
  async getSettings(guildId: string): Promise<Record<string, unknown>> {
    return this._getSettings(guildId);
  }

  /**
   * Returns a single setting value for the given guild, falling back to `defaultValue`
   * when the key is absent.
   *
   * @param guildId - The Discord guild snowflake ID.
   * @param key - The setting key as declared in the addon manifest.
   * @param defaultValue - Value returned when the setting is not configured.
   */
  async getSetting<T = unknown>(guildId: string, key: string, defaultValue?: T): Promise<T> {
    const settings = await this._getSettings(guildId);
    return (settings[key] ?? defaultValue) as T;
  }

  /**
   * Retrieves a guild from the Discord client's cache by ID.
   * Returns `undefined` when the guild is not cached.
   *
   * @param guildId - The Discord guild snowflake ID.
   */
  getGuild(guildId: string) {
    return this.client.guilds.cache.get(guildId);
  }
}
