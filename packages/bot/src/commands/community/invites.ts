/**
 * /invites command — displays invite counts for a given member, sourced from the
 * InviteTracker module. Requires the invite tracker to be enabled in guild settings.
 */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { InviteTrackerModule } from '../../modules/inviteTracker/InviteTrackerModule.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check how many members you or another user has invited')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User to check (defaults to yourself)').setRequired(false)
    ),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('cmd.invites.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    if (!extended.inviteTrackerEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.invites.disabledTitle', loc), t('cmd.invites.disabled', loc))] });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const row = await InviteTrackerModule.getUserCount(interaction.guild.id, target.id);
    const total = (row?.invites ?? 0) + (row?.bonus ?? 0);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.invites.title', loc, { user: target.username }))
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: t('cmd.invites.totalInvites', loc), value: `${total}`, inline: true },
        { name: t('cmd.invites.bonus', loc),        value: `${row?.bonus ?? 0}`, inline: true },
      )
      .setFooter({ text: interaction.guild.name });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
