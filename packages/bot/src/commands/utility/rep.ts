/**
 * /rep command — manages the per-guild reputation system: give a point to
 * another member (once per 24 hours), check a member's total, or view the
 * server leaderboard.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

import { swallow } from '../../logger.js';
const REP_COOLDOWN_SECONDS = 24 * 60 * 60;

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Reputation system — give or view reputation points')
    .addSubcommand((s) =>
      s
        .setName('give')
        .setDescription('Give a reputation point to a member (once per 24 hours)')
        .addUserOption((o) =>
          o.setName('user').setDescription('The member to give rep to').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName('top').setDescription('View the top reputation leaderboard'),
    )
    .addSubcommand((s) =>
      s
        .setName('check')
        .setDescription("Check a member's reputation points")
        .addUserOption((o) =>
          o.setName('user').setDescription('Member to check (defaults to yourself)').setRequired(false),
        ),
    ),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    if (!interaction.guild) return;

    const loc = await resolveUserLocale(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === 'give') {
      const target = interaction.options.getUser('user', true);

      if (target.id === interaction.user.id) {
        await interaction.reply({ content: t('cmd.rep.selfGive', loc), flags: MessageFlags.Ephemeral });
        return;
      }
      if (target.bot) {
        await interaction.reply({ content: t('cmd.rep.botGive', loc), flags: MessageFlags.Ephemeral });
        return;
      }

      const cooldownKey = `rep:cooldown:${interaction.guild.id}:${interaction.user.id}`;
      const ttl = await redis.ttl(cooldownKey);

      if (ttl > 0) {
        const hours = Math.ceil(ttl / 3600);
        await interaction.reply({
          content: t('cmd.rep.cooldown', loc, { hours }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await prisma.reputation.create({
        data: { guildId: interaction.guild.id, giverId: interaction.user.id, receiverId: target.id },
      });

      await redis.setex(cooldownKey, REP_COOLDOWN_SECONDS, '1');

      const total = await prisma.reputation.count({
        where: { guildId: interaction.guild.id, receiverId: target.id },
      });

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription(t('cmd.rep.gave', loc, { giver: interaction.user.toString(), target: target.toString(), total }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'check') {
      const target = interaction.options.getUser('user') ?? interaction.user;

      const total = await prisma.reputation.count({
        where: { guildId: interaction.guild.id, receiverId: target.id },
      });

      const rank = await prisma.reputation.groupBy({
        by: ['receiverId'],
        where: { guildId: interaction.guild.id },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      const rankPosition = rank.findIndex((r) => r.receiverId === target.id) + 1;

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(t('cmd.rep.checkTitle', loc, { user: target.username }))
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: t('cmd.rep.fieldPoints', loc), value: `${total}`, inline: true },
          { name: t('cmd.rep.fieldRank', loc), value: rankPosition > 0 ? `#${rankPosition}` : t('cmd.rep.unranked', loc), inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'top') {
      const top = await prisma.reputation.groupBy({
        by: ['receiverId'],
        where: { guildId: interaction.guild.id },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });

      if (top.length === 0) {
        await interaction.reply({ content: t('cmd.rep.topEmpty', loc), flags: MessageFlags.Ephemeral });
        return;
      }

      const lines = await Promise.all(
        top.map(async (entry, i) => {
          const user = await interaction.client.users.fetch(entry.receiverId).catch(swallow);
          const name = user?.username ?? entry.receiverId;
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          return t('cmd.rep.topLine', loc, { medal, name, count: entry._count.id });
        }),
      );

      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(t('cmd.rep.topTitle', loc))
        .setDescription(lines.join('\n'))
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
