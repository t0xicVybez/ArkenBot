
import { prisma } from '../database.js';
import { redis, pub } from '../redis.js';
import { REDIS_KEYS } from '@arkenbot/shared';
import type { GuildSettings, AutoModConfig, WelcomeConfig } from '@arkenbot/shared';

export class SettingsService {

  static async reloadGuildSettings(guildId: string): Promise<void> {
    await redis.del(REDIS_KEYS.GUILD_SETTINGS(guildId));
    await pub.publish('api:events', JSON.stringify({ type: 'settings:reload', data: { guildId } }));
  }

  static async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    return settings as GuildSettings | null;
  }

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

  static async getAutoModConfig(guildId: string): Promise<AutoModConfig | null> {
    const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
    await redis.del(`automod:config:${guildId}`);
    return config as AutoModConfig | null;
  }

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

  static async getWelcomeConfig(guildId: string): Promise<WelcomeConfig | null> {
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });
    return config as WelcomeConfig | null;
  }

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
