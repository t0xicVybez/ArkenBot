/**
 * Anti-nuke protection module.
 *
 * Tracks destructive actions (channel deletes, role deletes, bans, kicks) per
 * user in Redis with a 60-second rolling window. When a user exceeds the
 * configured threshold the module strips their roles, notifies admins and
 * optionally bans or kicks them, then posts an alert embed.
 */

import { type Guild, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { redis } from '../../redis.js';
import { getGuildSettings } from '../../utils/settings.js';
import { logger, swallow} from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

type ActionType = 'channelDelete' | 'roleDelete' | 'ban' | 'kick';

interface AntiNukeConfig {
  enabled: boolean;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  banThreshold: number;
  action: 'deop' | 'ban' | 'kick';
  alertChannelId: string | null;
}

function defaultConfig(): AntiNukeConfig {
  return {
    enabled: false,
    channelDeleteThreshold: 3,
    roleDeleteThreshold: 3,
    banThreshold: 5,
    action: 'deop',
    alertChannelId: null,
  };
}

function thresholdFor(config: AntiNukeConfig, actionType: ActionType): number {
  switch (actionType) {
    case 'channelDelete': return config.channelDeleteThreshold;
    case 'roleDelete':    return config.roleDeleteThreshold;
    case 'ban':           return config.banThreshold;
    case 'kick':          return config.banThreshold;
  }
}

export class AntiNukeModule {
  static async trackAction(guild: Guild, userId: string, actionType: ActionType): Promise<void> {
    try {
      const settings = await getGuildSettings(guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const rawConfig = extended.antiNuke as Partial<AntiNukeConfig> | undefined;
      if (!rawConfig?.enabled) return;

      const config: AntiNukeConfig = { ...defaultConfig(), ...rawConfig };

      const key = `antinuke:actions:${guild.id}:${userId}:${actionType}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 60);
      }

      const threshold = thresholdFor(config, actionType);
      if (count >= threshold) {
        // Reset counter immediately to avoid repeated punishments
        await redis.del(key);
        await AntiNukeModule.punish(guild, userId, actionType, config);
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id, userId, actionType }, 'AntiNuke trackAction error');
    }
  }

  static async punish(guild: Guild, userId: string, actionType: ActionType, config: AntiNukeConfig): Promise<void> {
    try {
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
      const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(swallow);

      // Remove all roles from the offender
      if (member) {
        const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id);
        for (const [, role] of rolesToRemove) {
          await member.roles.remove(role, 'Anti-nuke: destructive action threshold exceeded').catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Manage Roles', target: `<@${userId}>` }));
        }
      }

      // DM all admins using the cache (no bulk member fetch)
      const adminMembers = guild.members.cache.filter(
        m => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator) && m.id !== userId
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(t('antiNuke.alertTitle', loc))
        .setDescription(t('antiNuke.alertDescription', loc, { user: `<@${userId}>`, action: actionType, server: guild.name }))
        .setTimestamp();

      for (const [, admin] of adminMembers) {
        await admin.send({ embeds: [dmEmbed] }).catch(swallow);
      }

      // Apply configured punishment
      if (config.action === 'ban' && guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        await guild.members.ban(userId, { reason: `Anti-nuke: ${actionType} threshold exceeded` }).catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Ban Members', target: `<@${userId}>` }));
      } else if (config.action === 'kick' && member && guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
        await member.kick(`Anti-nuke: ${actionType} threshold exceeded`).catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Kick Members', target: `<@${userId}>` }));
      }

      // Send alert embed to configured channel
      if (config.alertChannelId) {
        const alertChannel = guild.channels.cache.get(config.alertChannelId);
        if (alertChannel?.isTextBased() && 'send' in alertChannel) {
          const alertEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(t('antiNuke.triggeredTitle', loc))
            .setDescription(t('antiNuke.triggeredDescription', loc, { user: `<@${userId}>`, action: actionType }))
            .addFields(
              { name: t('antiNuke.actionTaken', loc), value: config.action === 'deop' ? t('antiNuke.deopped', loc) : config.action, inline: true },
              { name: t('antiNuke.trigger', loc), value: actionType, inline: true },
            )
            .setTimestamp();
          await (alertChannel as import('discord.js').TextChannel).send({ embeds: [alertEmbed] }).catch(swallow);
        }
      }

      logger.warn({ guildId: guild.id, userId, actionType, punishment: config.action }, 'Anti-nuke triggered');
    } catch (err) {
      logger.error({ err, guildId: guild.id, userId }, 'AntiNuke punish error');
    }
  }
}
