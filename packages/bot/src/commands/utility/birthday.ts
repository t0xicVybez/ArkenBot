/**
 * /birthday command — manages birthday entries per guild: set, remove, list
 * upcoming birthdays, or check a specific member's birthday.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import type { BotCommand } from '../../types.js';
import { prisma } from '../../database.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

/** Localized long month name (1-12) for the given BCP-47 locale. */
const monthName = (month: number, loc: string): string =>
  new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)));

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday tracker commands')
    .addSubcommand((s) =>
      s.setName('set')
        .setDescription('Set your birthday')
        .addIntegerOption((o) => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption((o) => o.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
    )
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Remove your birthday')
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List upcoming birthdays in this server')
    )
    .addSubcommand((s) =>
      s.setName('check')
        .setDescription('Check a member\'s birthday')
        .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
    ),
  category: 'utility',
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const loc = await resolveUserLocale(interaction);

    if (sub === 'set') {
      const month = interaction.options.getInteger('month', true);
      const day = interaction.options.getInteger('day', true);

      await prisma.birthday.upsert({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
        update: { month, day },
        create: { guildId, userId: interaction.user.id, month, day },
      });

      void interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(t('cmd.birthday.setTitle', loc))
          .setDescription(t('cmd.birthday.set', loc, { date: `**${monthName(month, loc)} ${day}**` }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      await prisma.birthday.deleteMany({ where: { guildId, userId: interaction.user.id } });
      void interaction.reply({ content: t('cmd.birthday.removed', loc), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const now = new Date();
      const currentMonth = now.getUTCMonth() + 1;
      const currentDay = now.getUTCDate();

      const birthdays = await prisma.birthday.findMany({
        where: { guildId },
        orderBy: [{ month: 'asc' }, { day: 'asc' }],
      });

      if (!birthdays.length) {
        void interaction.reply({ content: t('cmd.birthday.none', loc), flags: MessageFlags.Ephemeral });
        return;
      }

      // Sort by proximity to the current calendar date so the next upcoming birthday appears first.
      const sorted = [...birthdays].sort((a, b) => {
        const aFuture = a.month > currentMonth || (a.month === currentMonth && a.day >= currentDay);
        const bFuture = b.month > currentMonth || (b.month === currentMonth && b.day >= currentDay);
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        if (a.month !== b.month) return a.month - b.month;
        return a.day - b.day;
      });

      const lines = sorted.slice(0, 20).map((b) => `<@${b.userId}> — **${monthName(b.month, loc)} ${b.day}**`);

      void interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(t('cmd.birthday.listTitle', loc))
          .setDescription(lines.join('\n'))
          .setFooter({ text: t('cmd.birthday.total', loc, { count: birthdays.length }) })],
      });
    }

    if (sub === 'check') {
      const user = interaction.options.getUser('user', true);
      const record = await prisma.birthday.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } });
      if (!record) {
        void interaction.reply({ content: t('cmd.birthday.userNotSet', loc, { user: user.username }), flags: MessageFlags.Ephemeral });
        return;
      }
      void interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(t('cmd.birthday.userBirthday', loc, { user: user.toString(), date: `**${monthName(record.month, loc)} ${record.day}**` }))],
      });
    }
  },
};

export default command;
