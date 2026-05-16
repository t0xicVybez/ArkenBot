/**
 * /rankcard command — allows members to personalise their rank card with a
 * custom accent colour or background image, and preview the result.
 */
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { generateRankCard } from '../../utils/rankCard.js';
import { xpForLevel } from '@arkenbot/shared';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const URL_RE = /^https?:\/\/.+\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i;

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rankcard')
    .setDescription('Customise your rank card appearance')
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Set the accent colour of your rank card')
        .addStringOption((opt) =>
          opt.setName('hex').setDescription('Hex colour code e.g. #ff5733').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('background')
        .setDescription('Set a custom background image for your rank card')
        .addStringOption((opt) =>
          opt.setName('url').setDescription('Direct image URL (png/jpg/gif)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Reset your rank card to the default style')
    )
    .addSubcommand((sub) =>
      sub.setName('preview').setDescription('Preview your current rank card style')
    ),
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'reset') {
      await prisma.userRankCardStyle.deleteMany({ where: { userId: interaction.user.id } });
      await interaction.editReply({ embeds: [successEmbed('Reset', 'Your rank card has been reset to the default style.')] });
      return;
    }

    if (sub === 'color') {
      const hex = interaction.options.getString('hex', true).trim();
      if (!HEX_RE.test(hex)) {
        await interaction.editReply({ embeds: [errorEmbed('Invalid Color', 'Please provide a valid hex color code, e.g. `#ff5733` or `#f53`.')] });
        return;
      }
      await prisma.userRankCardStyle.upsert({
        where:  { userId: interaction.user.id },
        update: { accentColor: hex },
        create: { userId: interaction.user.id, accentColor: hex },
      });
      await interaction.editReply({ embeds: [successEmbed('Color Updated', `Your rank card accent colour has been set to \`${hex}\`.`)] });
      return;
    }

    if (sub === 'background') {
      const url = interaction.options.getString('url', true).trim();
      if (!URL_RE.test(url)) {
        await interaction.editReply({ embeds: [errorEmbed('Invalid URL', 'Please provide a direct image URL ending in `.png`, `.jpg`, `.gif`, or `.webp`.')] });
        return;
      }
      await prisma.userRankCardStyle.upsert({
        where:  { userId: interaction.user.id },
        update: { backgroundUrl: url },
        create: { userId: interaction.user.id, backgroundUrl: url },
      });
      await interaction.editReply({ embeds: [successEmbed('Background Updated', 'Your rank card background has been updated. Use `/rank` to see it.')] });
      return;
    }

    if (sub === 'preview') {
      if (!interaction.guild) {
        await interaction.editReply({ embeds: [errorEmbed('Error', 'Use this command in a server.')] });
        return;
      }

      const [userLevel, style] = await Promise.all([
        prisma.userLevel.findUnique({
          where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } },
        }),
        prisma.userRankCardStyle.findUnique({ where: { userId: interaction.user.id } }),
      ]);

      const rank = userLevel
        ? await prisma.userLevel.count({ where: { guildId: interaction.guild.id, xp: { gt: userLevel.xp } } })
        : 0;

      const level = userLevel?.level ?? 0;
      const totalXp = userLevel?.xp ?? 0;
      let xpInLevel = totalXp;
      for (let i = 0; i <= level; i++) xpInLevel -= xpForLevel(i);
      if (xpInLevel < 0) xpInLevel = 0;

      const cardBuffer = await generateRankCard({
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png' }),
        rank: rank + 1,
        level,
        xpInLevel,
        xpNeeded: xpForLevel(level + 1),
        totalXp,
        totalMessages: userLevel?.totalMessages ?? 0,
        accentColor:   style?.accentColor ?? undefined,
        backgroundUrl: style?.backgroundUrl ?? undefined,
      });

      const attachment = new AttachmentBuilder(cardBuffer, { name: 'preview.png' });
      await interaction.editReply({ content: 'Here is a preview of your rank card:', files: [attachment] });
    }
  },
};

export default command;
