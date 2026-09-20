/**
 * /poll command — creates an interactive poll with up to 10 options, optional
 * duration, and per-user vote toggling. Votes update the embed in real time via
 * button interactions handled by `handleButton`.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import type { BotCommand } from '../../types.js';
import { prisma } from '../../database.js';
import { generatePollChart } from '../../utils/pollChart.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { ensureGuildExists } from '../../utils/settings.js';

import { swallow } from '../../logger.js';
/**
 * Builds the poll embed showing each option's vote count and percentage bar.
 *
 * @param question - The poll question displayed as the embed title.
 * @param options  - The list of option labels.
 * @param votes    - Current vote records used to compute counts and percentages.
 * @param endsAt   - Optional expiry timestamp rendered as a relative Discord timestamp.
 */
export function buildPollEmbed(question: string, options: string[], votes: { optionIndex: number }[], endsAt: Date | null | undefined, loc: string): EmbedBuilder {
  const total = votes.length;
  const description = options.map((opt, i) => {
    const count = votes.filter((v) => v.optionIndex === i).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `**${i + 1}. ${opt}**\n${bar} ${pct}% (${t('cmd.poll.votes', loc, { count })})`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${question}`)
    .setDescription(description)
    .setFooter({ text: t('cmd.poll.totalVotes', loc, { count: total }) });

  if (endsAt) embed.addFields({ name: t('cmd.poll.ends', loc), value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true });
  return embed;
}

/**
 * Builds the button component rows for a poll, grouping options into rows of
 * up to 5 buttons (the Discord component limit). Appends an "End Poll" button
 * for open polls.
 *
 * @param pollId  - Database ID of the poll, embedded in each button's custom ID.
 * @param options - Option labels used as button labels (truncated to 80 chars).
 * @param closed  - When true, all buttons are rendered as disabled.
 */
export function buildPollComponents(pollId: string, options: string[], closed: boolean, loc: string): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const buttons: ButtonBuilder[] = options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`poll:vote:${pollId}:${i}`)
      .setLabel(opt.length > 80 ? opt.slice(0, 77) + '...' : opt)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(closed)
  );

  // Discord allows a maximum of 5 buttons per action row.
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  if (!closed) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`poll:close:${pollId}`).setLabel(t('cmd.poll.endPoll', loc)).setStyle(ButtonStyle.Danger),
    ));
  }

  return rows;
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption((o) => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption((o) => o.setName('options').setDescription('Your choices, separated by | — 2 to 10 (e.g. Pizza | Tacos | Sushi)').setRequired(true))
    .addIntegerOption((o) => o.setName('duration').setDescription('How long the poll stays open (optional)').addChoices(
      { name: '30 minutes', value: 30 },
      { name: '1 hour', value: 60 },
      { name: '6 hours', value: 360 },
      { name: '12 hours', value: 720 },
      { name: '1 day', value: 1440 },
      { name: '3 days', value: 4320 },
      { name: '1 week', value: 10080 },
      { name: '2 weeks', value: 20160 },
      { name: '1 month', value: 43200 },
    ))
    .addBooleanOption((o) => o.setName('multi').setDescription('Allow multiple votes per user')),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const question = interaction.options.getString('question', true);
    const rawOptions = interaction.options.getString('options', true).split('|').map((o) => o.trim()).filter(Boolean);
    const duration = interaction.options.getInteger('duration');
    const multiVote = interaction.options.getBoolean('multi') ?? false;

    if (rawOptions.length < 2 || rawOptions.length > 10) {
      await interaction.reply({ content: t('cmd.poll.optionCount', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const endsAt = duration ? new Date(Date.now() + duration * 60 * 1000) : null;

    // Guarantee the guild row exists before the poll's FK references it (a guild
    // that never finished syncing would otherwise fail with a P2003).
    if (interaction.guild) {
      await ensureGuildExists(interaction.guild.id, interaction.guild.name, interaction.guild.ownerId, interaction.guild.iconURL() ?? undefined);
    }

    const poll = await prisma.poll.create({
      data: {
        guildId: interaction.guildId!,
        channelId: interaction.channelId,
        question,
        options: rawOptions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        endsAt,
        multiVote,
        createdById: interaction.user.id,
      },
    });

    const embed = buildPollEmbed(question, rawOptions, [], endsAt, loc);
    const components = buildPollComponents(poll.id, rawOptions, false, loc);

    const { resource } = await interaction.reply({ embeds: [embed], components, withResponse: true });

    await prisma.poll.update({ where: { id: poll.id }, data: { messageId: resource!.message!.id } });

    // Auto-close is handled durably by the BackgroundJobs poll sweep (closePolls),
    // which reads endsAt — so it survives restarts and supports long durations
    // (a month) that an in-process setTimeout could not.
  },

  async handleButton(interaction: ButtonInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const pollId = parts[2];

    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { votes: true } });
    if (!poll) { void interaction.reply({ content: t('cmd.poll.notFound', loc), flags: MessageFlags.Ephemeral }); return; }
    if (poll.closed) { void interaction.reply({ content: t('cmd.poll.alreadyEnded', loc), flags: MessageFlags.Ephemeral }); return; }

    const options = poll.options as string[];

    if (action === 'close') {
      if (interaction.user.id !== poll.createdById && !(interaction.memberPermissions?.has('ManageMessages'))) {
        void interaction.reply({ content: t('cmd.poll.cannotEnd', loc), flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.poll.update({ where: { id: pollId }, data: { closed: true } });
      const updatedVotes = await prisma.pollVote.findMany({ where: { pollId } });
      const embed = buildPollEmbed(poll.question, options, updatedVotes, poll.endsAt, loc)
        .setTitle(`📊 ${t('cmd.poll.ended', loc, { question: poll.question })}`)
        .setColor(0x57f287);
      const chartBuffer = await generatePollChart(poll.question, options, updatedVotes).catch(swallow);
      await interaction.update({
        embeds: [embed],
        components: buildPollComponents(pollId, options, true, loc),
        files: chartBuffer ? [{ attachment: chartBuffer, name: 'poll-results.png' }] : [],
      });
      return;
    }

    if (action === 'vote') {
      const optionIndex = parseInt(parts[3]);
      const userId = interaction.user.id;

      if (!poll.multiVote) {
        await prisma.pollVote.deleteMany({ where: { pollId, userId } });
      }

      const existing = await prisma.pollVote.findFirst({ where: { pollId, userId, optionIndex } });
      if (existing) {
        await prisma.pollVote.delete({ where: { id: existing.id } });
      } else {
        await prisma.pollVote.create({ data: { pollId, userId, optionIndex } });
      }

      const updatedVotes = await prisma.pollVote.findMany({ where: { pollId } });
      const embed = buildPollEmbed(poll.question, options, updatedVotes, poll.endsAt, loc);
      await interaction.update({ embeds: [embed], components: buildPollComponents(pollId, options, false, loc) });
    }
  },
};

export default command;
