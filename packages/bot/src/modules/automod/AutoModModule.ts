

import { type Message, type GuildMember, type TextChannel, EmbedBuilder, PermissionFlagsBits, GuildVerificationLevel } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { REDIS_KEYS, COLORS } from '@arkenbot/shared';
import type { AutoModConfig } from '@arkenbot/shared';
import { logger, swallow} from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { AppealsModule } from '../moderation/AppealsModule.js';
import { AiModerationModule } from './AiModerationModule.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';

const FILTER_VIOLATION_KEY = (guildId: string, userId: string) =>
  `automod:filter:${guildId}:${userId}`;

export class AutoModModule {

  private static async getConfig(guildId: string): Promise<AutoModConfig | null> {
    const cached = await redis.get(`automod:config:${guildId}`);
    if (cached) return JSON.parse(cached) as AutoModConfig;

    const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
    if (config) {
      await redis.setex(`automod:config:${guildId}`, 60, JSON.stringify(config));
    }
    return config as AutoModConfig | null;
  }

  static async analyze(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const config = await this.getConfig(message.guild.id);
    if (!config) return;

    const member = message.member as GuildMember;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    const hasExemptRole = config.exemptRoles.some((r) => member.roles.cache.has(r));
    const isExemptChannel = config.exemptChannels.includes(message.channelId);
    if (hasExemptRole || isExemptChannel) return;

    if (config.antiSpamEnabled && await this.checkSpam(message, config)) return;
    if (config.filterEnabled && await this.checkWordFilter(message, config)) return;
    if (config.antiLinkEnabled && this.checkLinks(message, config)) return;
    if (config.antiMentionEnabled && this.checkMentions(message, config)) return;
    if (config.antiCapsEnabled && this.checkCaps(message, config)) return;

    if (config.aiModEnabled) void AiModerationModule.scan(message, config);
  }

  private static async checkSpam(message: Message, config: AutoModConfig): Promise<boolean> {
    const key = REDIS_KEYS.SPAM_TRACKER(message.guild!.id, message.author.id);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(config.antiSpamInterval / 1000));
    }

    if (count >= config.antiSpamThreshold) {
      await this.takeAction(message, config.antiSpamAction, 'Spam detected');
      await redis.del(key);
      return true;
    }
    return false;
  }

  private static async checkWordFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    const content = message.content.toLowerCase();
    const matchedWord = config.filteredWords.find((word) =>
      content.includes(word.toLowerCase())
    );
    if (!matchedWord) return false;

    await this.handleWordFilterViolation(message, config);
    return true;
  }

  private static async handleWordFilterViolation(
    message: Message,
    config: AutoModConfig,
  ): Promise<void> {
    const guildId = message.guild!.id;
    const userId = message.author.id;
    const member = message.member as GuildMember;

    await message.delete().catch((e) => notifyActionFailure(message.guild!, { action: 'automodDelete', error: e, requiredPermission: 'Manage Messages', channelId: message.channelId, target: message.author.toString() }));

    const key = FILTER_VIOLATION_KEY(guildId, userId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86400);
    }

    const warnBeforeTimeout = config.filterWarnBeforeTimeout ?? 3;
    const warnBeforeKick    = config.filterWarnBeforeKick    ?? 5;
    const timeoutDuration   = config.filterTimeoutDuration   ?? 300;

    let action: 'warn' | 'timeout' | 'kick' = 'warn';
    if (count >= warnBeforeKick) {
      action = 'kick';
    } else if (count >= warnBeforeTimeout) {
      action = 'timeout';
    }

    await prisma.warning.create({
      data: {
        guildId,
        userId,
        userTag: message.author.tag,
        moderatorId: message.client.user!.id,
        moderatorTag: message.client.user!.tag,
        reason: `[AutoMod] Word filter violation #${count}`,
      },
    }).catch(swallow);

    await prisma.logEntry.create({
      data: {
        guildId,
        type: 'automod',
        userId,
        data: { action, reason: 'Word filter violation', count, channelId: message.channelId },
      },
    }).catch(swallow);

    if (action === 'timeout') {
      await member.timeout(timeoutDuration * 1000, `AutoMod: Word filter violation #${count}`)
        .catch((e) => notifyActionFailure(message.guild!, { action: 'automodTimeout', error: e, requiredPermission: 'Timeout Members', channelId: message.channelId, target: message.author.toString() }));
    } else if (action === 'kick') {

      const authorLoc = await resolveUserLocale({ user: message.author, guildId, guildLocale: message.guild!.preferredLocale });
      const dmText = config.filterKickDMMessage
        ? config.filterKickDMMessage
            .replace(/\{count\}/g, String(count))
            .replace(/\{server\}/g, message.guild!.name)
        : t('automod.filterKickDM', authorLoc, { server: message.guild!.name, count });
      await message.author
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle(t('automod.kickedTitle', authorLoc, { server: message.guild!.name }))
              .setDescription(dmText),
          ],
        })
        .catch(swallow);

      await member.kick(`AutoMod: Word filter violation #${count}`).catch((e) => notifyActionFailure(message.guild!, { action: 'automodKick', error: e, requiredPermission: 'Kick Members', channelId: message.channelId, target: message.author.toString() }));

      await redis.del(key);
    }

    if (!('send' in message.channel)) return;
    const ch = message.channel as TextChannel;

    const resolveMsg = (template: string, vars: Record<string, string>) =>
      template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

    const vars = { user: `<@${userId}>`, count: String(count), server: message.guild!.name };
    const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: message.guild!.preferredLocale });

    let notifyContent: string;
    if (action === 'kick') {
      notifyContent = config.filterKickMessage
        ? resolveMsg(config.filterKickMessage, vars)
        : t('automod.filterKick', loc, { user: vars.user, count: vars.count });
    } else {
      notifyContent = config.filterWarnMessage
        ? resolveMsg(config.filterWarnMessage, vars)
        : t('automod.filterWarn', loc, { user: vars.user, count: vars.count });
    }

    await ch
      .send({ content: notifyContent })
      .then((m) => setTimeout(() => m.delete().catch(swallow), 8000))
      .catch(swallow);
  }

  private static checkLinks(message: Message, config: AutoModConfig): boolean {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = message.content.match(urlPattern);
    if (!urls) return false;

    const hasBlockedLink = urls.some((url) => {
      try {
        const domain = new URL(url).hostname;
        return config.allowedDomains.length > 0 && !config.allowedDomains.includes(domain);
      } catch {
        return false;
      }
    });

    if (hasBlockedLink) {
      this.takeAction(message, config.linkAction, 'Blocked link detected');
      return true;
    }

    return false;
  }

  private static checkMentions(message: Message, config: AutoModConfig): boolean {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount >= config.mentionThreshold) {
      this.takeAction(message, 'delete', 'Mention spam');
      return true;
    }
    return false;
  }

  private static checkCaps(message: Message, config: AutoModConfig): boolean {
    if (message.content.length < 10) return false;
    const letters = message.content.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return false;
    const capsPercent = (message.content.replace(/[^A-Z]/g, '').length / letters.length) * 100;

    if (capsPercent >= config.capsThreshold) {
      this.takeAction(message, 'delete', 'Excessive caps');
      return true;
    }
    return false;
  }

  private static async takeAction(
    message: Message,
    action: string,
    reason: string
  ): Promise<void> {
    try {
      await message.delete().catch((e) => notifyActionFailure(message.guild!, { action: 'automodDelete', error: e, requiredPermission: 'Manage Messages', channelId: message.channelId, target: message.author.toString() }));

      if (action === 'warn' || action === 'mute' || action === 'kick' || action === 'ban') {
        if ('send' in message.channel) {
          const loc = await resolveUserLocale({ user: { id: '' }, guildId: message.guild?.id, guildLocale: message.guild?.preferredLocale });
          const reasonKeyMap: Record<string, string> = {
            'Spam detected': 'automod.reasons.spam',
            'Blocked link detected': 'automod.reasons.link',
            'Mention spam': 'automod.reasons.mention',
            'Excessive caps': 'automod.reasons.caps',
          };
          const localizedReason = reasonKeyMap[reason] ? t(reasonKeyMap[reason], loc) : reason;
          await (message.channel as TextChannel)
            .send({
              content: t('automod.removed', loc, { user: `<@${message.author.id}>`, reason: localizedReason }),
            })
            .then((m) => setTimeout(() => m.delete().catch(swallow), 5000))
            .catch(swallow);
        }
      }

      if (action === 'mute' && message.member) {
        await message.member.timeout(60000, `AutoMod: ${reason}`).catch((e) => notifyActionFailure(message.guild!, { action: 'automodTimeout', error: e, requiredPermission: 'Timeout Members', channelId: message.channelId, target: message.author.toString() }));
      }

      if (action === 'kick' && message.member?.kickable) {
        await message.member.kick(`AutoMod: ${reason}`).catch((e) => notifyActionFailure(message.guild!, { action: 'automodKick', error: e, requiredPermission: 'Kick Members', channelId: message.channelId, target: message.author.toString() }));
      }

      if (action === 'ban' && message.member?.bannable) {
        await message.member.ban({ reason: `AutoMod: ${reason}`, deleteMessageSeconds: 86400 }).catch((e) => notifyActionFailure(message.guild!, { action: 'automodBan', error: e, requiredPermission: 'Ban Members', channelId: message.channelId, target: message.author.toString() }));
      }

      if (message.guild) {
        await prisma.logEntry.create({
          data: {
            guildId: message.guild.id,
            type: 'automod',
            userId: message.author.id,
            data: { action, reason, channelId: message.channelId },
          },
        });
      }
    } catch (err) {
      logger.error({ err }, 'AutoMod action failed');
    }
  }

  static async checkAccountAge(member: GuildMember, config: AutoModConfig): Promise<void> {
    if (member.user.bot) return;
    const ageHours = (Date.now() - member.user.createdTimestamp) / 3_600_000;

    if (config.minAccountAgeEnabled && ageHours < config.minAccountAgeHours) {
      const action = config.minAccountAgeAction;
      if (action === 'kick' || action === 'ban') {
        const loc = await resolveUserLocale({ user: member.user, guildId: member.guild.id, guildLocale: member.guild.preferredLocale });

        const appealsOn = action === 'ban' && await AppealsModule.enabled(member.guild.id);
        await member.send({
          embeds: [new EmbedBuilder().setColor(COLORS.ERROR)
            .setTitle(t('accountGate.dmTitle', loc, { server: member.guild.name }))
            .setDescription(t('accountGate.dm', loc, { server: member.guild.name, hours: config.minAccountAgeHours }))],
          components: appealsOn ? [AppealsModule.appealButton(member.guild.id, 'ban', loc)] : [],
        }).catch(swallow);
        if (action === 'ban') {
          if (member.bannable) await member.ban({ reason: 'Alt/raid protection: account too new' }).catch((e) => notifyActionFailure(member.guild, { action: 'ban', error: e, requiredPermission: 'Ban Members', target: member.toString() }));
        } else if (member.kickable) {
          await member.kick('Alt/raid protection: account too new').catch((e) => notifyActionFailure(member.guild, { action: 'kick', error: e, requiredPermission: 'Kick Members', target: member.toString() }));
        }
      } else if (action === 'quarantine' && config.quarantineRoleId) {

        const role = member.guild.roles.cache.get(config.quarantineRoleId);
        const me = member.guild.members.me;
        if (role && me?.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
          await member.roles.add(role, 'Alt/raid protection: quarantined new account').catch((e) => notifyActionFailure(member.guild, { action: 'manageRoles', error: e, requiredPermission: 'Manage Roles', target: member.toString() }));
        } else {
          await notifyActionFailure(member.guild, { action: 'manageRoles', error: new Error('Missing Manage Roles or quarantine role too high'), requiredPermission: 'Manage Roles', target: member.toString() });
        }
      }
      const alertKind = action === 'quarantine' ? 'quarantine' : action === 'alert' ? 'alert' : action;
      await this.postJoinAlert(member, alertKind as 'kick' | 'ban' | 'alert' | 'quarantine', config.minAccountAgeHours);
      return;
    }

    if (config.newAccountFlagEnabled && ageHours < config.newAccountFlagHours) {
      await this.postJoinAlert(member, 'flag', config.newAccountFlagHours);
    }
  }

  private static async postJoinAlert(member: GuildMember, kind: 'kick' | 'ban' | 'alert' | 'flag' | 'quarantine', thresholdHours: number): Promise<void> {
    const settings = await getGuildSettings(member.guild.id);
    const channelId = settings?.modLogChannelId ?? settings?.logChannelId;
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: member.guild.id, guildLocale: member.guild.preferredLocale });
    const created = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;
    const isBlock = kind === 'kick' || kind === 'ban' || kind === 'quarantine';
    const actionWord = t(`accountGate.action.${kind}`, loc);
    const embed = new EmbedBuilder()
      .setColor(kind === 'kick' || kind === 'ban' ? COLORS.ERROR : 0xfaa61a)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
      .setTitle(isBlock ? t('accountGate.gateTitle', loc) : t('accountGate.flagTitle', loc))
      .setDescription(t(isBlock ? 'accountGate.gateDesc' : 'accountGate.flagDesc', loc, { user: member.toString(), tag: member.user.tag, action: actionWord }))
      .addFields(
        { name: t('accountGate.fieldCreated', loc), value: created, inline: true },
        { name: t('accountGate.fieldThreshold', loc), value: t('accountGate.hours', loc, { hours: thresholdHours }), inline: true },
      )
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch((e) => notifyActionFailure(member.guild, { action: 'sendMessage', error: e, requiredPermission: 'Send Messages / Embed Links', channelId, target: member.toString() }));
  }

  static async checkRaid(guildId: string, config: AutoModConfig): Promise<boolean> {
    const key = REDIS_KEYS.RAID_TRACKER(guildId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(config.raidInterval / 1000));
    }

    return count >= config.raidThreshold;
  }

  static async handleMemberJoin(member: GuildMember): Promise<void> {
    const config = await this.getConfig(member.guild.id);
    if (!config) return;

    await this.checkAccountAge(member, config).catch((err) => logger.error({ err }, 'account-age check failed'));

    if (!config.antiRaidEnabled) return;

    const isRaid = await this.checkRaid(member.guild.id, config);
    if (!isRaid) return;

    logger.warn(`Anti-raid triggered in guild ${member.guild.id} — action: ${config.raidAction}`);

    try {
      if (config.raidAction === 'kick') {
        if (member.kickable) {
          await member.kick('Anti-raid protection');
        }
      } else {

        await member.guild.setVerificationLevel(
          GuildVerificationLevel.High,
          'Anti-raid: surge of joins detected — verification level raised to High',
        );
        logger.warn(`Guild ${member.guild.id} verification level raised to HIGH due to raid detection`);
      }
    } catch (err) {
      logger.error({ err }, 'Anti-raid action failed');
    }
  }
}
