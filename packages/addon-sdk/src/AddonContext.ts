/**
 * Runtime context injected into every addon command handler, event handler, and lifecycle hook.
 * Provides scoped access to the Discord client, persistent storage, structured logging,
 * the inter-addon event bus, and per-guild settings.
 */

import type { Client } from 'discord.js';
import type { AddonStorage, AddonLogger } from './types.js';
import type { AddonEventBus } from './AddonEventBus.js';

export class AddonContext {
  public readonly addonName: string;
  public readonly client: Client;
  public readonly storage: AddonStorage;
  public readonly logger: AddonLogger;
  public readonly events: AddonEventBus;

  private _getSettings: (guildId: string) => Promise<Record<string, unknown>>;

  constructor(options: {
    addonName: string;
    client: Client;
    storage: AddonStorage;
    logger: AddonLogger;
    events: AddonEventBus;
    getSettings: (guildId: string) => Promise<Record<string, unknown>>;
  }) {
    this.addonName = options.addonName;
    this.client = options.client;
    this.storage = options.storage;
    this.logger = options.logger;
    this.events = options.events;
    this._getSettings = options.getSettings;
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
