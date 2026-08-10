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

import { swallow } from '../../logger.js';
/**
 * Builds the poll embed showing each option's vote count and percentage bar.
 *
 * @param question - The poll question displayed as the embed title.
 * @param options  - The list of option labels.
 * @param votes    - Current vote records used to compute counts and percentages.
 * @param endsAt   - Optional expiry timestamp rendered as a relative Discord timestamp.
 */
function buildPollEmbed(question: string, options: string[], votes: { optionIndex: number }[], endsAt?: Date | null): EmbedBuilder {
  const total = votes.length;
  const description = options.map((opt, i) => {
    const count = votes.filter((v) => v.optionIndex === i).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `**${i + 1}. ${opt}**\n${bar} ${pct}% (${count} vote${count !== 1 ? 's' : ''})`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${question}`)
    .setDescription(description)
    .setFooter({ text: `${total} total vote${total !== 1 ? 's' : ''}` });

  if (endsAt) embed.addFields({ name: 'Ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true });
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
function buildPollComponents(pollId: string, options: string[], closed: boolean): ActionRowBuilder<ButtonBuilder>[] {
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
      new ButtonBuilder().setCustomId(`poll:close:${pollId}`).setLabel('End Poll').setStyle(ButtonStyle.Danger),
    ));
  }

  return rows;
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption((o) => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption((o) => o.setName('options').setDescription('Options separated by | (e.g. Yes | No | Maybe)').setRequired(true))
    .addIntegerOption((o) => o.setName('duration').setDescription('Duration in minutes (optional)').setMinValue(1).setMaxValue(10080))
    .addBooleanOption((o) => o.setName('multi').setDescription('Allow multiple votes per user')),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const question = interaction.options.getString('question', true);
    const rawOptions = interaction.options.getString('options', true).split('|').map((o) => o.trim()).filter(Boolean);
    const duration = interaction.options.getInteger('duration');
    const multiVote = interaction.options.getBoolean('multi') ?? false;

    if (rawOptions.length < 2 || rawOptions.length > 10) {
      void interaction.reply({ content: 'Please provide between 2 and 10 options separated by `|`.', flags: MessageFlags.Ephemeral });
    }

    const endsAt = duration ? new Date(Date.now() + duration * 60 * 1000) : null;

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

    const embed = buildPollEmbed(question, rawOptions, [], endsAt);
    const components = buildPollComponents(poll.id, rawOptions, false);

    const { resource } = await interaction.reply({ embeds: [embed], components, withResponse: true });

    await prisma.poll.update({ where: { id: poll.id }, data: { messageId: resource!.message!.id } });

    // Schedule in-process auto-close. This is a best-effort convenience: if the
    // process restarts before the timer fires, the poll will remain open until
    // a moderator ends it manually via the button.
    if (endsAt) {
      setTimeout(async () => {
        try {
          await prisma.poll.update({ where: { id: poll.id }, data: { closed: true } });
          const updatedPoll = await prisma.poll.findUnique({ where: { id: poll.id }, include: { votes: true } });
          if (!updatedPoll) return;
          const closedEmbed = buildPollEmbed(question, rawOptions, updatedPoll.votes, endsAt)
            .setTitle(`📊 [ENDED] ${question}`)
            .setColor(0x57f287);
          const chartBuffer = await generatePollChart(question, rawOptions, updatedPoll.votes).catch(swallow);
          await interaction.editReply({
            embeds: [closedEmbed],
            components: buildPollComponents(poll.id, rawOptions, true),
            files: chartBuffer ? [{ attachment: chartBuffer, name: 'poll-results.png' }] : [],
          });
        } catch { /* poll message may have been deleted */ }
      }, duration! * 60 * 1000);
    }
  },

  async handleButton(interaction: ButtonInteraction, _client: BotClient) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const pollId = parts[2];

    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { votes: true } });
    if (!poll) { void interaction.reply({ content: 'Poll not found.', flags: MessageFlags.Ephemeral }); return; }
    if (poll.closed) { void interaction.reply({ content: 'This poll has ended.', flags: MessageFlags.Ephemeral }); return; }

    const options = poll.options as string[];

    if (action === 'close') {
      if (interaction.user.id !== poll.createdById && !(interaction.memberPermissions?.has('ManageMessages'))) {
        void interaction.reply({ content: 'Only the poll creator or a moderator can end this poll.', flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.poll.update({ where: { id: pollId }, data: { closed: true } });
      const updatedVotes = await prisma.pollVote.findMany({ where: { pollId } });
      const embed = buildPollEmbed(poll.question, options, updatedVotes, poll.endsAt)
        .setTitle(`📊 [ENDED] ${poll.question}`)
        .setColor(0x57f287);
      const chartBuffer = await generatePollChart(poll.question, options, updatedVotes).catch(swallow);
      await interaction.update({
        embeds: [embed],
        components: buildPollComponents(pollId, options, true),
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
      const embed = buildPollEmbed(poll.question, options, updatedVotes, poll.endsAt);
      await interaction.update({ embeds: [embed], components: buildPollComponents(pollId, options, false) });
    }
  },
};

export default command;
