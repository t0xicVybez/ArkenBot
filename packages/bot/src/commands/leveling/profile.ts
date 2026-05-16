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

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const settings = await getGuildSettings(interaction.guild.id);
    if (settings && !settings.levelingEnabled) {
      await interaction.editReply({ embeds: [errorEmbed('Leveling Disabled', 'The leveling system is disabled for this server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: targetUser.id } },
    });

    if (!userLevel) {
      await interaction.editReply({
        embeds: [errorEmbed('No Data', `${targetUser.username} hasn't earned any XP yet.`)],
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
      ? achievements.map((a) => `${a.emoji} **${a.name}** — ${a.description}`).join('\n')
      : '*No achievements yet. Keep chatting!*';

    const member = interaction.guild.members.cache.get(targetUser.id);
    const joinedAt = member?.joinedAt
      ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(`${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🏆 Server Rank', value: `#${rank + 1}`, inline: true },
        { name: '📈 Level', value: `${currentLevel}`, inline: true },
        { name: '✨ Total XP', value: `${currentXp.toLocaleString()}`, inline: true },
        { name: '💬 Messages', value: `${userLevel.totalMessages.toLocaleString()}`, inline: true },
        { name: '📅 Joined', value: joinedAt, inline: true },
        { name: `Progress to Level ${currentLevel + 1}`, value: `\`${progressBar}\`\n${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP` },
        { name: `🎖️ Achievements (${achievements.length})`, value: achievementText },
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
