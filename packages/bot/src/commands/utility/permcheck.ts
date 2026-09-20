/**
 * /permcheck — reports which permissions ArkenBot is missing in the current
 * server (guild-wide) and in individual channels, so admins can see exactly why
 * a feature is silently failing instead of hitting a Missing Permissions error.
 * Restricted to members with Manage Server.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  OAuth2Scopes,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

// Guild-wide permissions the bot's features rely on, with the Discord label
// (kept in Discord's own English wording — these are product feature names, not
// translatable app copy) and a short feature hint key is not used to keep the
// list compact; the label alone is what admins match against Discord's UI.
const NEEDED: { flag: bigint; label: string }[] = [
  { flag: PermissionFlagsBits.ViewAuditLog,   label: 'View Audit Log' },
  { flag: PermissionFlagsBits.ManageRoles,    label: 'Manage Roles' },
  { flag: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
  { flag: PermissionFlagsBits.ManageGuild,    label: 'Manage Server' },
  { flag: PermissionFlagsBits.BanMembers,     label: 'Ban Members' },
  { flag: PermissionFlagsBits.KickMembers,    label: 'Kick Members' },
  { flag: PermissionFlagsBits.ModerateMembers, label: 'Timeout Members' },
  { flag: PermissionFlagsBits.ManageMessages, label: 'Manage Messages' },
  { flag: PermissionFlagsBits.ManageWebhooks, label: 'Manage Webhooks' },
  { flag: PermissionFlagsBits.ManageNicknames, label: 'Manage Nicknames' },
];

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('permcheck')
    .setDescription("Check which permissions ArkenBot is missing in this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('cmd.permcheck.serverOnly', loc))], flags: MessageFlags.Ephemeral });
      return;
    }

    const me = await interaction.guild.members.fetchMe();
    const embed = new EmbedBuilder().setTitle(t('cmd.permcheck.title', loc)).setColor(COLORS.INFO);

    // Administrator short-circuits everything.
    if (me.permissions.has(PermissionFlagsBits.Administrator)) {
      embed.setColor(0x57f287).setDescription(t('cmd.permcheck.allGoodAdmin', loc));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const missingGuild = NEEDED.filter((p) => !me.permissions.has(p.flag)).map((p) => p.label);

    // Channel-level: text channels where the bot can't view or fully post.
    const channelIssues: string[] = [];
    const textChannels = interaction.guild.channels.cache.filter(
      (c): c is GuildTextBasedChannel =>
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && !c.isThread(),
    );
    for (const ch of textChannels.values()) {
      const cp = ch.permissionsFor(me);
      const miss: string[] = [];
      if (!cp.has(PermissionFlagsBits.ViewChannel)) {
        miss.push('View Channel');
      } else {
        if (!cp.has(PermissionFlagsBits.SendMessages)) miss.push('Send Messages');
        if (!cp.has(PermissionFlagsBits.EmbedLinks)) miss.push('Embed Links');
        if (!cp.has(PermissionFlagsBits.AddReactions)) miss.push('Add Reactions');
      }
      if (miss.length) channelIssues.push(`<#${ch.id}> — ${miss.join(', ')}`);
      if (channelIssues.length >= 15) break;
    }

    if (missingGuild.length === 0 && channelIssues.length === 0) {
      embed.setColor(0x57f287).setDescription(t('cmd.permcheck.allGood', loc));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    embed.setColor(0xfaa61a);

    if (missingGuild.length > 0) {
      embed.addFields({ name: t('cmd.permcheck.serverMissingTitle', loc), value: missingGuild.map((l) => `• ${l}`).join('\n') });
      const url = client.generateInvite({
        scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        permissions: NEEDED.map((p) => p.flag).reduce((a, b) => a | b, 0n)
          | PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages
          | PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.AddReactions
          | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageThreads,
      });
      embed.addFields({ name: '​', value: t('cmd.permcheck.reInvite', loc, { url }) });
    }

    if (channelIssues.length > 0) {
      embed.addFields({ name: t('cmd.permcheck.channelIssuesTitle', loc), value: channelIssues.join('\n').slice(0, 1024) });
    }

    embed.setFooter({ text: t('cmd.permcheck.footer', loc) });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
