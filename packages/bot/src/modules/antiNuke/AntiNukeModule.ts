

/**
 * Anti-nuke protection. Watches for a single person performing destructive
 * actions (deleting channels/roles, mass bans/kicks) in quick succession —
 * the signature of a compromised admin account or a rogue mod — and, past a
 * configured threshold, steps in to stop and punish them.
 *
 * Action counts are tracked per actor in Redis with a short window, so the
 * threshold means "N of these within the window", not "N ever".
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
  // Trusted roles/users are fully exempt — their destructive actions are never
  // counted, so senior staff who legitimately do bulk channel/role cleanup
  // don't trip the protection at all.
  whitelistRoles: string[];
  whitelistUsers: string[];
}

function defaultConfig(): AntiNukeConfig {
  return {
    enabled: false,
    channelDeleteThreshold: 3,
    roleDeleteThreshold: 3,
    banThreshold: 5,
    action: 'deop',
    alertChannelId: null,
    whitelistRoles: [],
    whitelistUsers: [],
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

const ACTION_WINDOW_SECONDS = 60;

// Human-readable phrasing for the service log, so the dashboard shows what
// actually happened ("deleted roles") rather than the raw enum ("roleDelete").
const ACTION_LABELS: Record<ActionType, string> = {
  channelDelete: 'deleted channels',
  roleDelete:    'deleted roles',
  ban:           'banned members',
  kick:          'kicked members',
};

export class AntiNukeModule {
  static async trackAction(guild: Guild, userId: string, actionType: ActionType): Promise<void> {
    try {
      const settings = await getGuildSettings(guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const rawConfig = extended.antiNuke as Partial<AntiNukeConfig> | undefined;
      if (!rawConfig?.enabled) return;

      const config: AntiNukeConfig = { ...defaultConfig(), ...rawConfig };

      // Trusted users/roles are exempt entirely — don't even start counting.
      if (config.whitelistUsers.includes(userId)) return;
      if (config.whitelistRoles.length > 0) {
        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(swallow);
        if (member && config.whitelistRoles.some((roleId) => member.roles.cache.has(roleId))) return;
      }

      const key = `antinuke:actions:${guild.id}:${userId}:${actionType}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ACTION_WINDOW_SECONDS);
      }

      const threshold = thresholdFor(config, actionType);
      if (count >= threshold) {

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

      // Discord never lets a bot strip roles from, ban, or kick a server owner,
      // so attempting it only produces failed-permission noise (and the owner
      // tripping their own threshold while reorganising roles is the most
      // common false positive). For the owner we skip the punishment and only
      // raise the alert, so a compromised owner account is still flagged.
      const isOwner = userId === guild.ownerId;
      const punishmentApplied = !isOwner;

      if (member && !isOwner) {
        const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id);
        for (const [, role] of rolesToRemove) {
          await member.roles.remove(role, 'Anti-nuke: destructive action threshold exceeded').catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Manage Roles', target: `<@${userId}>` }));
        }
      }

      const adminMembers = guild.members.cache.filter(
        m => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator) && m.id !== userId
      );
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(t('antiNuke.alertTitle', loc))
        .setDescription(
          isOwner
            ? t('antiNuke.alertDescriptionOwner', loc, { user: `<@${userId}>`, action: actionType, server: guild.name })
            : t('antiNuke.alertDescription', loc, { user: `<@${userId}>`, action: actionType, server: guild.name }),
        )
        .setTimestamp();

      for (const [, admin] of adminMembers) {
        await admin.send({ embeds: [dmEmbed] }).catch(swallow);
      }

      if (!isOwner) {
        if (config.action === 'ban' && guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
          await guild.members.ban(userId, { reason: `Anti-nuke: ${actionType} threshold exceeded` }).catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Ban Members', target: `<@${userId}>` }));
        } else if (config.action === 'kick' && member && guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
          await member.kick(`Anti-nuke: ${actionType} threshold exceeded`).catch((e) => notifyActionFailure(guild, { action: 'antiNuke', error: e, requiredPermission: 'Kick Members', target: `<@${userId}>` }));
        }
      }

      if (config.alertChannelId) {
        const alertChannel = guild.channels.cache.get(config.alertChannelId);
        if (alertChannel?.isTextBased() && 'send' in alertChannel) {
          const actionTakenValue = isOwner
            ? t('antiNuke.ownerAlertOnly', loc)
            : config.action === 'deop'
              ? t('antiNuke.deopped', loc)
              : config.action;
          const alertEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(t('antiNuke.triggeredTitle', loc))
            .setDescription(
              isOwner
                ? t('antiNuke.triggeredDescriptionOwner', loc, { user: `<@${userId}>`, action: actionType })
                : t('antiNuke.triggeredDescription', loc, { user: `<@${userId}>`, action: actionType }),
            )
            .addFields(
              { name: t('antiNuke.actionTaken', loc), value: actionTakenValue, inline: true },
              { name: t('antiNuke.trigger', loc), value: actionType, inline: true },
            )
            .setTimestamp();
          await (alertChannel as import('discord.js').TextChannel).send({ embeds: [alertEmbed] }).catch(swallow);
        }
      }

      const actorTag = member?.user?.tag ?? userId;
      const threshold = thresholdFor(config, actionType);
      const response = isOwner
        ? `${config.action} skipped — ${actorTag} is the server owner (alert only)`
        : config.action;
      logger.warn(
        {
          guildId: guild.id,
          guildName: guild.name,
          userId,
          actorTag,
          actionType,
          threshold,
          windowSeconds: ACTION_WINDOW_SECONDS,
          punishment: config.action,
          punishmentApplied,
          isOwner,
        },
        `Anti-nuke triggered in "${guild.name}": ${actorTag} ${ACTION_LABELS[actionType]} ${threshold}+ times within ${ACTION_WINDOW_SECONDS}s — response: ${response}`,
      );
    } catch (err) {
      logger.error({ err, guildId: guild.id, userId }, 'AntiNuke punish error');
    }
  }
}
