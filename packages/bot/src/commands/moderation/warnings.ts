/**
 * /warnings command — lists up to 10 warnings for a member, optionally
 * including previously cleared warnings.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { COLORS } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to check').setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt.setName('include_cleared').setDescription('Include cleared warnings').setRequired(false)
    ),
  category: 'moderation',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    const settings = await getGuildSettings(interaction.guildId!);
    if (settings && !settings.moderationEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('moderation.disabledTitle', loc), t('moderation.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const includeCleared = interaction.options.getBoolean('include_cleared') ?? false;

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const warnings = await prisma.warning.findMany({
      where: {
        guildId: interaction.guild.id,
        userId: targetUser.id,
        ...(includeCleared ? {} : { active: true }),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (warnings.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(t('cmd.warnings.noneTitle', loc))
            .setDescription(includeCleared ? t('cmd.warnings.noneAll', loc, { user: targetUser.tag }) : t('cmd.warnings.noneActive', loc, { user: targetUser.tag })),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(t('cmd.warnings.title', loc, { user: targetUser.tag }))
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        warnings
          .map(
            (w, i) =>
              `**${i + 1}.** ${w.reason}\n> ${t('cmd.warnings.lineMeta', loc, { moderator: `<@${w.moderatorId}>`, date: `<t:${Math.floor(w.createdAt.getTime() / 1000)}:d>` })}${
                !w.active ? ` ${t('cmd.warnings.cleared', loc)}` : ''
              }`
          )
          .join('\n\n')
      )
      .setFooter({ text: t('cmd.warnings.footer', loc, { count: warnings.length }) });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
