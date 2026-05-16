/**
 * Provides read/write access to guild-level settings (general, auto-mod, welcome)
 * and keeps the bot's Redis cache consistent after every write.
 */
import { prisma } from '../database.js';
import { redis, pub } from '../redis.js';
import { REDIS_KEYS } from '@arkenbot/shared';
import type { GuildSettings, AutoModConfig, WelcomeConfig } from '@arkenbot/shared';

export class SettingsService {
  /**
   * Invalidates the bot's cached settings for a guild and publishes a
   * `settings:reload` event so the bot picks up the changes immediately.
   */
  static async reloadGuildSettings(guildId: string): Promise<void> {
    await redis.del(REDIS_KEYS.GUILD_SETTINGS(guildId));
    await pub.publish('api:events', JSON.stringify({ type: 'settings:reload', data: { guildId } }));
  }

  /** Returns the general settings for a guild, or `null` if none exist yet. */
  static async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    return settings as GuildSettings | null;
  }

  /**
   * Upserts general guild settings and triggers a cache reload on the bot.
   */
  static async updateGuildSettings(
    guildId: string,
    data: Partial<GuildSettings>
  ): Promise<GuildSettings> {
    const settings = await prisma.guildSettings.upsert({
      where: { guildId },
      update: data as object,
      create: { guildId, ...(data as object) },
    });

    await this.reloadGuildSettings(guildId);
    return settings as GuildSettings;
  }

  /**
   * Returns the auto-mod configuration for a guild and invalidates the
   * auto-mod Redis cache entry so subsequent bot reads fetch fresh data.
   */
  static async getAutoModConfig(guildId: string): Promise<AutoModConfig | null> {
    const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
    await redis.del(`automod:config:${guildId}`);
    return config as AutoModConfig | null;
  }

  /**
   * Upserts the auto-mod configuration, invalidates its Redis cache entry,
   * and triggers a full settings reload on the bot.
   */
  static async updateAutoModConfig(
    guildId: string,
    data: Partial<AutoModConfig>
  ): Promise<AutoModConfig> {
    const config = await prisma.autoModConfig.upsert({
      where: { guildId },
      update: data as object,
      create: { guildId, ...(data as object) },
    });

    await redis.del(`automod:config:${guildId}`);
    await this.reloadGuildSettings(guildId);
    return config as AutoModConfig;
  }

  /** Returns the welcome/leave configuration for a guild, or `null` if none exist yet. */
  static async getWelcomeConfig(guildId: string): Promise<WelcomeConfig | null> {
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });
    return config as WelcomeConfig | null;
  }

  /**
   * Upserts the welcome/leave configuration and triggers a cache reload on the bot.
   */
  static async updateWelcomeConfig(
    guildId: string,
    data: Partial<WelcomeConfig>
  ): Promise<WelcomeConfig> {
    const config = await prisma.welcomeConfig.upsert({
      where: { guildId },
      update: data as object,
      create: { guildId, ...(data as object) },
    });

    await this.reloadGuildSettings(guildId);
    return config as WelcomeConfig;
  }
}
