/**
 * /bannetwork — staff tools for the cross-server ban network.
 *   check <user>  — how many network servers banned a user, and why
 *   scan          — flag current members who are network-banned, with a
 *                   one-click "Ban all flagged" action
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { BanNetworkModule } from '../../modules/moderation/BanNetworkModule.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('bannetwork')
    .setDescription('Cross-server ban network tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand((s) => s.setName('check').setDescription('Check a user against the ban network')
      .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true)))
    .addSubcommand((s) => s.setName('scan').setDescription('Scan current members against the ban network')),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.BanMembers],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.inGuild() || !interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const settings = await getGuildSettings(interaction.guild.id);
    const threshold = settings?.banNetworkThreshold ?? 3;

    if (sub === 'check') {
      const user = interaction.options.getUser('user', true);
      // Count ALL network servers (including this one) so a user you banned shows.
      const info = await BanNetworkModule.userBanInfo(user.id, '');
      if (info.count === 0) {
        await interaction.reply({ content: t('banNetwork.checkNone', loc, { user: `<@${user.id}>` }), flags: MessageFlags.Ephemeral });
        return;
      }
      let desc = t('banNetwork.checkFlagged', loc, { user: `<@${user.id}>`, count: info.count });
      if (info.count >= threshold) desc += `\n⚠️ ${t('banNetwork.checkThreshold', loc, { threshold })}`;
      const embed = new EmbedBuilder()
        .setColor(0xfaa61a)
        .setDescription(desc)
        .addFields({
          name: t('banNetwork.reasons', loc),
          value: info.reasons.length ? info.reasons.map((r) => `• ${r.slice(0, 200)}`).join('\n').slice(0, 1024) : t('banNetwork.noReasons', loc),
        })
        .setFooter({ text: `ID: ${user.id}` });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // scan
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const members = await BanNetworkModule.scanGuild(interaction.guild, threshold);
    if (!members.length) {
      await interaction.editReply({ content: t('banNetwork.scanNone', loc) });
      return;
    }
    const shown = members.slice(0, 25);
    const lines = await Promise.all(shown.map(async (m) => {
      const info = await BanNetworkModule.userBanInfo(m.id, interaction.guild!.id);
      return `• <@${m.id}> — ${t('banNetwork.scanBans', loc, { count: info.count })}`;
    }));
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(t('banNetwork.scanTitle', loc))
      .setDescription(`${t('banNetwork.scanDesc', loc, { count: members.length })}\n\n${lines.join('\n')}`.slice(0, 4000));
    if (members.length > shown.length) embed.setFooter({ text: t('banNetwork.scanMore', loc, { n: members.length - shown.length }) });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('bannet:banall:_').setStyle(ButtonStyle.Danger).setLabel(t('banNetwork.scanBanAll', loc, { count: members.length })),
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

export default command;
