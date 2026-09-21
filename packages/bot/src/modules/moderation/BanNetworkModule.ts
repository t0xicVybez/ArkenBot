/**
 * Cross-server ban network (opt-in). Opted-in guilds contribute their bans to a
 * shared list; a user is only *flagged* in a receiving guild once they've been
 * banned in >= that guild's threshold of OTHER opted-in guilds, so no single
 * rogue admin can blacklist someone network-wide. Default action is a staff
 * alert (with anonymised reasons); a guild can opt up to auto-ban.
 */
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
  type GuildMember,
  type TextChannel,
  type ButtonInteraction,
  type Client,
} from 'discord.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { resolveUserLocale, t } from '../../i18n/index.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { logger, swallow } from '../../logger.js';

export class BanNetworkModule {
  /** Record a ban contributed by an opted-in, contributing guild. */
  static async recordBan(guildId: string, userId: string, reason: string | null): Promise<void> {
    try {
      const settings = await getGuildSettings(guildId);
      if (!settings?.banNetworkEnabled || settings.banNetworkContribute === false) return;
      await prisma.federatedBan.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId, reason: reason?.slice(0, 500) ?? null },
        update: { reason: reason?.slice(0, 500) ?? null, createdAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err, guildId, userId }, 'Ban network: failed to record ban');
    }
  }

  /** Remove a guild's contribution when it unbans the user. */
  static async removeBan(guildId: string, userId: string): Promise<void> {
    await prisma.federatedBan.deleteMany({ where: { guildId, userId } }).catch(swallow);
  }

  /** Network ban count + sample reasons for one user (excluding a guild). */
  static async userBanInfo(userId: string, excludeGuildId: string): Promise<{ count: number; reasons: string[] }> {
    const bans = await prisma.federatedBan.findMany({
      where: { userId, guildId: { not: excludeGuildId } },
      select: { reason: true },
    });
    const reasons = [...new Set(bans.map((b) => b.reason?.trim()).filter(Boolean) as string[])].slice(0, 5);
    return { count: bans.length, reasons };
  }

  /** User IDs banned in >= threshold guilds other than excludeGuildId. */
  static async flaggedUserIds(excludeGuildId: string, threshold: number): Promise<string[]> {
    const groups = await prisma.federatedBan.groupBy({
      by: ['userId'],
      where: { guildId: { not: excludeGuildId } },
      _count: { userId: true },
      having: { userId: { _count: { gte: Math.max(1, threshold) } } },
    });
    return groups.map((g) => g.userId);
  }

  /** Members currently in the guild who are network-flagged (fetches only them). */
  static async scanGuild(guild: import('discord.js').Guild, threshold: number): Promise<GuildMember[]> {
    const ids = await this.flaggedUserIds(guild.id, threshold);
    if (!ids.length) return [];
    const present: GuildMember[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const fetched = await guild.members.fetch({ user: ids.slice(i, i + 100) }).catch(() => null);
      if (fetched) present.push(...fetched.values());
    }
    return present;
  }

  /** Ban every currently-present flagged member. Returns how many were banned. */
  static async banAllFlagged(guild: import('discord.js').Guild, threshold: number, moderatorTag: string): Promise<number> {
    const members = await this.scanGuild(guild, threshold);
    let banned = 0;
    for (const m of members.slice(0, 200)) {
      if (!m.bannable) continue;
      const ok = await m.ban({ reason: `Ban network scan — actioned by ${moderatorTag}` }).then(() => true).catch(() => false);
      if (ok) banned++;
    }
    return banned;
  }

  /** On join: flag / auto-ban a member banned in >= threshold other guilds. */
  static async checkMember(member: GuildMember): Promise<void> {
    try {
      if (member.user.bot) return;
      const guildId = member.guild.id;
      const settings = await getGuildSettings(guildId);
      if (!settings?.banNetworkEnabled) return;
      const threshold = Math.max(1, settings.banNetworkThreshold ?? 3);

      const bans = await prisma.federatedBan.findMany({
        where: { userId: member.id, guildId: { not: guildId } },
        select: { reason: true },
      });
      if (bans.length < threshold) return;

      const reasons = [...new Set(bans.map((b) => b.reason?.trim()).filter(Boolean) as string[])].slice(0, 5);

      if ((settings.banNetworkAction ?? 'alert') === 'ban') {
        const loc = await resolveUserLocale({ user: { id: '' }, guildId });
        await member.ban({ reason: t('banNetwork.banReason', loc, { count: bans.length }) }).catch((e) =>
          notifyActionFailure(member.guild, { action: 'ban', error: e, requiredPermission: 'BanMembers', target: member.user.tag }),
        );
        await this.postFlag(member, bans.length, reasons, true);
      } else {
        await this.postFlag(member, bans.length, reasons, false);
      }
    } catch (err) {
      logger.warn({ err, guildId: member.guild.id, userId: member.id }, 'Ban network: member check failed');
    }
  }

  /** Post a staff flag to the network channel (falls back to mod-log / log). */
  private static async postFlag(member: GuildMember, count: number, reasons: string[], autoBanned: boolean): Promise<void> {
    const settings = await getGuildSettings(member.guild.id);
    const channelId = settings?.banNetworkChannelId || settings?.modLogChannelId || settings?.logChannelId;
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: member.guild.id, guildLocale: member.guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(autoBanned ? 0xed4245 : 0xfaa61a)
      .setAuthor({ name: t('banNetwork.flagTitle', loc), iconURL: member.user.displayAvatarURL() })
      .setDescription(t('banNetwork.flagDesc', loc, { user: `<@${member.id}>`, tag: member.user.tag, count }))
      .addFields({
        name: t('banNetwork.reasons', loc),
        value: reasons.length ? reasons.map((r) => `• ${r.slice(0, 200)}`).join('\n').slice(0, 1024) : t('banNetwork.noReasons', loc),
      })
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();
    if (autoBanned) embed.addFields({ name: '​', value: `🔨 ${t('banNetwork.autoBanned', loc)}` });

    const components = autoBanned
      ? []
      : [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`bannet:ban:${member.id}`).setStyle(ButtonStyle.Danger).setLabel(t('banNetwork.btnBan', loc)),
          new ButtonBuilder().setCustomId(`bannet:dismiss:${member.id}`).setStyle(ButtonStyle.Secondary).setLabel(t('banNetwork.btnDismiss', loc)),
        )];

    await channel.send({ embeds: [embed], components }).catch((e) =>
      notifyActionFailure(member.guild, { action: 'sendMessage', error: e, requiredPermission: 'SendMessages', channelId }),
    );
  }

  /** Handle the Ban / Dismiss buttons on a flag alert. */
  static async handleButton(interaction: ButtonInteraction, _client: Client): Promise<void> {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.inGuild() || !interaction.guild) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: t('banNetwork.needBan', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    const [, action, userId] = interaction.customId.split(':');

    if (action === 'banall') {
      await interaction.deferUpdate();
      const settings = await getGuildSettings(interaction.guild.id);
      const banned = await this.banAllFlagged(interaction.guild, settings?.banNetworkThreshold ?? 3, interaction.user.tag);
      await interaction.editReply({ content: t('banNetwork.banAllDone', loc, { count: banned }), embeds: [], components: [] }).catch(swallow);
      return;
    }

    if (action === 'ban') {
      try {
        await interaction.guild.members.ban(userId, { reason: t('banNetwork.banByStaff', loc, { mod: interaction.user.tag }) });
      } catch (e) {
        await interaction.reply({ content: t('banNetwork.banFailed', loc), flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.update({
        content: `🔨 ${t('banNetwork.bannedBy', loc, { user: `<@${userId}>`, mod: `<@${interaction.user.id}>` })}`,
        components: [],
      }).catch(swallow);
    } else {
      await interaction.update({
        content: t('banNetwork.dismissedBy', loc, { mod: `<@${interaction.user.id}>` }),
        components: [],
      }).catch(swallow);
    }
  }
}
