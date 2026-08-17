import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { chatCompletion, isLLMAvailable, LLMUnavailableError } from '@arkenbot/shared';
import { checkCooldown } from '../utils/shared.js';

const SYSTEM_PROMPT = [
  'You are ArkenBot, a helpful assistant inside a Discord server.',
  'Answer clearly and concisely — a few short paragraphs at most, or a compact bulleted list.',
  'Use Discord markdown (bold, bullets, inline code) where it helps readability.',
  'If you are unsure or the question needs information you do not have, say so plainly rather than inventing an answer.',
  'Keep the whole reply under 1500 characters.',
].join(' ');

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI assistant a question')
    .addStringOption((o) =>
      o.setName('question').setDescription('What would you like to ask?').setRequired(true).setMaxLength(1000),
    )
    .addBooleanOption((o) =>
      o.setName('private').setDescription('Only you can see the answer (default: false)').setRequired(false),
    ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;

    const loc = await ctx.resolveLocale(interaction);

    if (!isLLMAvailable()) {
      await interaction.reply({ content: ctx.t('unavailable', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const cooldown = checkCooldown(interaction.user.id);
    if (cooldown) {
      await interaction.reply({ content: ctx.t('cooldown', loc, { seconds: cooldown }), flags: MessageFlags.Ephemeral });
      return;
    }

    const question = interaction.options.getString('question', true).trim();
    const ephemeral = interaction.options.getBoolean('private') ?? false;

    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    try {
      const answer = await chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
        { temperature: 0.5, maxTokens: 700 },
      );

      if (!answer) {
        await interaction.editReply(ctx.t('askNothing', loc));
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: ctx.t('askAuthor', loc, { user: interaction.user.username }), iconURL: interaction.user.displayAvatarURL() })
        .setDescription(`**❓ ${question.slice(0, 240)}**\n\n${answer.slice(0, 3900)}`)
        .setFooter({ text: ctx.t('askFooter', loc) })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof LLMUnavailableError) {
        await interaction.editReply(ctx.t('unavailable', loc));
        return;
      }
      ctx.logger.warn(`/ask failed: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply(ctx.t('askError', loc));
    }
  },
};

export default command;
