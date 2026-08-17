/**
 * /profile command — displays a member's full leveling profile including rank,
 * XP progress bar, message count, server join date, and earned achievements.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS, xpForLevel } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';
import { AchievementsModule } from '../../modules/leveling/AchievementsModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("View a member's full profile: level, XP, stats, and achievements")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Member to view (defaults to yourself)').setRequired(false),
    ),
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.profile.disabledTitle', loc), t('cmd.profile.disabled', loc))] });
      return;
    }

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: targetUser.id } },
    });

    if (!userLevel) {
      await interaction.editReply({
        embeds: [errorEmbed(t('cmd.profile.noDataTitle', loc), t('cmd.profile.noData', loc, { user: targetUser.username }))],
      });
      return;
    }

    const rank = await prisma.userLevel.count({
      where: { guildId: interaction.guild.id, xp: { gt: userLevel.xp } },
    });

    const currentLevel = userLevel.level;
    const currentXp = userLevel.xp;
    const xpNeeded = xpForLevel(currentLevel + 1);

    let xpInLevel = currentXp;
    for (let i = 0; i <= currentLevel; i++) xpInLevel -= xpForLevel(i);
    if (xpInLevel < 0) xpInLevel = 0;

    const progressBarLength = 20;
    const filled = Math.round((xpInLevel / xpNeeded) * progressBarLength);
    const progressBar = '█'.repeat(filled) + '░'.repeat(progressBarLength - filled);

    const achievements = await AchievementsModule.getUserAchievements(
      interaction.guild.id,
      targetUser.id,
    );

    const achievementText = achievements.length > 0
      ? achievements.map((a) => `${a.emoji} **${t(`achievements.${a.id}.name`, loc)}** — ${t(`achievements.${a.id}.description`, loc)}`).join('\n')
      : t('cmd.profile.noAchievements', loc);

    const member = interaction.guild.members.cache.get(targetUser.id);
    const joinedAt = member?.joinedAt
      ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
      : t('cmd.profile.unknown', loc);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.profile.title', loc, { user: targetUser.username }))
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('cmd.profile.fieldServerRank', loc), value: `#${rank + 1}`, inline: true },
        { name: t('cmd.profile.fieldLevel', loc), value: `${currentLevel}`, inline: true },
        { name: t('cmd.profile.fieldTotalXp', loc), value: `${currentXp.toLocaleString()}`, inline: true },
        { name: t('cmd.profile.fieldMessages', loc), value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
        { name: t('cmd.profile.fieldJoined', loc), value: joinedAt, inline: true },
        { name: t('cmd.profile.fieldProgress', loc, { level: currentLevel + 1 }), value: `\`${progressBar}\`\n${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP` },
        { name: t('cmd.profile.fieldAchievements', loc, { count: achievements.length }), value: achievementText },
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
