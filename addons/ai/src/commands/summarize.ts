import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type Message,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { chatCompletion, isLLMAvailable, LLMUnavailableError } from '@arkenbot/shared';
import { checkCooldown } from '../utils/shared.js';

const DEFAULT_COUNT = 30;
const MAX_COUNT = 100;

const SYSTEM_PROMPT = [
  'You summarise Discord conversations so someone can catch up quickly.',
  'Given a transcript (oldest message first), produce a brief summary in Discord markdown:',
  'a one-line overview, then 3-6 concise bullet points of the key topics, decisions, or questions raised.',
  'Attribute points to people by name where it matters. Do not invent anything not in the transcript.',
  'Keep it under 1200 characters.',
].join(' ');

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Summarise the recent conversation in this channel')
    .addIntegerOption((o) =>
      o
        .setName('count')
        .setDescription(`How many recent messages to summarise (default ${DEFAULT_COUNT}, max ${MAX_COUNT})`)
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(MAX_COUNT),
    )
    .addBooleanOption((o) =>
      o.setName('private').setDescription('Only you can see the summary (default: false)').setRequired(false),
    ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;

    const loc = await ctx.resolveLocale(interaction);

    if (!isLLMAvailable()) {
      await interaction.reply({ content: ctx.t('unavailable', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.channel;
    if (!channel || channel.type === ChannelType.DM || !('messages' in channel)) {
      await interaction.reply({ content: ctx.t('sumGuildOnly', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const cooldown = checkCooldown(interaction.user.id);
    if (cooldown) {
      await interaction.reply({ content: ctx.t('cooldown', loc, { seconds: cooldown }), flags: MessageFlags.Ephemeral });
      return;
    }

    const count = interaction.options.getInteger('count') ?? DEFAULT_COUNT;
    const ephemeral = interaction.options.getBoolean('private') ?? false;

    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    try {
      const fetched = await channel.messages.fetch({ limit: count });
      // Oldest-first, drop empty/bot-noise, cap each line so a few long messages
      // can't blow the token budget.
      const lines = [...fetched.values()]
        .reverse()
        .filter((m: Message) => m.content.trim().length > 0 && !m.author.bot)
        .map((m: Message) => `${m.author.username}: ${m.content.replace(/\n+/g, ' ').slice(0, 400)}`);

      if (lines.length < 2) {
        await interaction.editReply(ctx.t('sumNotEnough', loc));
        return;
      }

      const summary = await chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Transcript:\n${lines.join('\n')}` },
        ],
        { temperature: 0.3, maxTokens: 600 },
      );

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(ctx.t('sumTitle', loc))
        .setDescription(summary.slice(0, 3900) || ctx.t('sumNoSummary', loc))
        .setFooter({ text: ctx.t('sumFooter', loc, { count: lines.length }) })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        await interaction.editReply(ctx.t('unavailable', loc));
        return;
      }
      ctx.logger.warn(`/summarize failed: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply(ctx.t('sumError', loc));
    }
  },
};

export default command;
