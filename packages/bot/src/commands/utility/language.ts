/**
 * /language — lets a user set, clear, or view the language the bot replies in.
 * The preference is stored per Discord user in UserPreferences and takes
 * priority over Discord-locale auto-detection. See ../../i18n for resolution.
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import { prisma } from '../../database.js';
import { LOCALES, isSupportedLocale } from '@arkenbot/shared';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { infoEmbed } from '../../utils/embed.js';

const command: BotCommand = {
  category: 'Utility',
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set or view the language I use when replying to you')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Choose the language for my replies to you')
        .addStringOption((o) =>
          o
            .setName('language')
            .setDescription('The language to use')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) => s.setName('clear').setDescription('Clear your language and go back to auto-detect'))
    .addSubcommand((s) => s.setName('show').setDescription('Show your current language')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'set') {
      const input = interaction.options.getString('language', true);
      if (!isSupportedLocale(input)) {
        const loc = await resolveUserLocale(interaction);
        await interaction.reply({ content: t('language.invalid', loc, { input }), flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, language: input },
        update: { language: input },
      });
      const native = LOCALES.find((l) => l.code === input)?.native ?? input;
      // Reply in the newly-chosen language so the user sees it take effect.
      await interaction.reply({
        embeds: [infoEmbed(t('language.setTitle', input), t('language.set', input, { language: native }))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'clear') {
      await prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, language: null },
        update: { language: null },
      });
      const loc = await resolveUserLocale(interaction);
      await interaction.reply({
        embeds: [infoEmbed(t('language.clearedTitle', loc), t('language.cleared', loc))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // show
    const pref = await prisma.userPreferences.findUnique({ where: { userId }, select: { language: true } });
    const loc = await resolveUserLocale(interaction);
    const native = LOCALES.find((l) => l.code === loc)?.native ?? loc;
    const body = pref?.language
      ? t('language.currentSet', loc, { language: native })
      : t('language.currentAuto', loc, { language: native });
    await interaction.reply({
      embeds: [infoEmbed(t('language.currentTitle', loc), body)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = LOCALES.filter(
      (l) =>
        l.name.toLowerCase().includes(focused) ||
        l.native.toLowerCase().includes(focused) ||
        l.code.toLowerCase().includes(focused),
    ).slice(0, 25);
    await interaction.respond(matches.map((l) => ({ name: `${l.native} (${l.name})`, value: l.code })));
  },
};

export default command;
