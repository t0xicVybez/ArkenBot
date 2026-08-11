/**
 * /avatar command — fetches and displays a user's full-resolution avatar with
 * download links for PNG and WebP formats.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Get a user's avatar")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user (defaults to yourself)').setRequired(false)
    ),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const avatarUrl = targetUser.displayAvatarURL({ size: 4096, extension: 'png' });

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.avatar.title', loc, { user: targetUser.tag }))
      .setImage(avatarUrl)
      .setFooter({ text: t('cmd.avatar.footer', loc, { id: targetUser.id }) });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(t('cmd.avatar.openBrowser', loc))
        .setStyle(ButtonStyle.Link)
        .setURL(avatarUrl),
      new ButtonBuilder()
        .setLabel('PNG')
        .setStyle(ButtonStyle.Link)
        .setURL(targetUser.displayAvatarURL({ size: 4096, extension: 'png' })),
      new ButtonBuilder()
        .setLabel('WebP')
        .setStyle(ButtonStyle.Link)
        .setURL(targetUser.displayAvatarURL({ size: 4096, extension: 'webp' })),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

export default command;
