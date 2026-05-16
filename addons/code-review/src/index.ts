/**
 * Code Review addon — lets users submit code snippets via a modal and
 * receive static analysis feedback (or AI-powered feedback when configured).
 * Supports JavaScript, TypeScript, Python, JSON, CSS, and HTML.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type ModalSubmitInteraction,
  type SlashCommandStringOption,
} from 'discord.js';

import { detectLanguage } from './analyzer/detect.js';
import { analyze } from './analyzer/index.js';
import { buildResultEmbed } from './utils/embed.js';
import { sendFormattedCode } from './utils/chunks.js';

const LANGUAGE_CHOICES = [
  { name: 'Auto-detect', value: 'auto' },
  { name: 'JavaScript', value: 'javascript' },
  { name: 'TypeScript', value: 'typescript' },
  { name: 'Python', value: 'python' },
  { name: 'JSON', value: 'json' },
  { name: 'CSS', value: 'css' },
  { name: 'HTML', value: 'html' },
] as const;

const MODAL_PREFIX = 'code-review:';

export default defineAddon({
  manifest: {
    name: 'code-review',
    displayName: 'Code Review',
    version: '2.0.0',
    description: 'Analyze code snippets for issues, style problems, and get formatted output.',
    author: 't0xicVybez',
    commands: ['reviewcode'],
    settings: [
      {
        key: 'maxLength',
        type: 'number',
        label: 'Maximum Code Length (chars)',
        description: 'Maximum characters allowed per review (max 4000)',
        default: 4000,
        min: 500,
        max: 4000,
      },
    ],
  },

  commands: [
    {
      // addStringOption() narrows the return type to SlashCommandOptionsOnlyBuilder,
      // so we cast back to SlashCommandBuilder to satisfy the SDK interface.
      data: new SlashCommandBuilder()
        .setName('reviewcode')
        .setDescription('Analyze a code snippet for issues and formatting')
        .addStringOption((opt: SlashCommandStringOption) =>
          opt
            .setName('language')
            .setDescription('Language hint — skip for auto-detection')
            .addChoices(...LANGUAGE_CHOICES)
            .setRequired(false),
        ) as unknown as SlashCommandBuilder,

      async execute(
        interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
        _ctx: AddonContext,
      ): Promise<void> {
        if (!interaction.isChatInputCommand()) return;

        const langHint = interaction.options.getString('language') ?? 'auto';

        // Embed the language hint in the modal's customId so the submit handler
        // can retrieve it without additional storage.
        const modal = new ModalBuilder()
          .setCustomId(`${MODAL_PREFIX}${langHint}`)
          .setTitle('Code Review')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('code')
                .setLabel('Paste your code here')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('// Paste your code snippet...')
                .setRequired(true)
                .setMaxLength(4000),
            ),
          );

        await interaction.showModal(modal);
      },
    },
  ],

  events: [
    {
      event: 'interactionCreate',
      // The SDK types the handler as (...args: ClientEvents[EventName]) without
      // narrowing on `event`, so we accept unknown[] and cast the first argument.
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as ModalSubmitInteraction;
        if (!interaction?.isModalSubmit?.()) return;
        if (!interaction.customId.startsWith(MODAL_PREFIX)) return;

        const langHint = interaction.customId.slice(MODAL_PREFIX.length);
        const raw = interaction.fields.getTextInputValue('code').trim();
        const guildId = interaction.guildId ?? undefined;

        const maxLength = guildId
          ? await ctx.getSetting<number>(guildId, 'maxLength', 4000)
          : 4000;

        if (raw.length > maxLength) {
          await interaction.reply({
            content: `❌ Code exceeds the maximum length of **${maxLength.toLocaleString()}** characters (yours: ${raw.length.toLocaleString()}).`,
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          const lang = langHint === 'auto' ? detectLanguage(raw) : langHint;
          const result = await analyze(raw, lang);

          const embed = buildResultEmbed(result);
          await interaction.editReply({ embeds: [embed] });

          await sendFormattedCode(interaction, lang, result.formatted);
        } catch (err) {
          ctx.logger.error('Code review failed', String(err));
          await interaction.editReply({
            content: '❌ An error occurred while analyzing your code. Please try again.',
          });
        }
      },
    },
  ],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info('Code Review v2.0 loaded.');
    },
  },
});
