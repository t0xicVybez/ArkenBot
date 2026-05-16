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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

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
          .setTitle('🎂 Birthday Set!')
          .setDescription(`Your birthday has been set to **${MONTH_NAMES[month - 1]} ${day}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      await prisma.birthday.deleteMany({ where: { guildId, userId: interaction.user.id } });
      void interaction.reply({ content: 'Your birthday has been removed.', flags: MessageFlags.Ephemeral });
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
        void interaction.reply({ content: 'No birthdays registered in this server yet.', flags: MessageFlags.Ephemeral });
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

      const lines = sorted.slice(0, 20).map((b) => `<@${b.userId}> — **${MONTH_NAMES[b.month - 1]} ${b.day}**`);

      void interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🎂 Upcoming Birthdays')
          .setDescription(lines.join('\n'))
          .setFooter({ text: `${birthdays.length} total` })],
      });
    }

    if (sub === 'check') {
      const user = interaction.options.getUser('user', true);
      const record = await prisma.birthday.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } });
      if (!record) {
        void interaction.reply({ content: `${user.username} hasn't set their birthday.`, flags: MessageFlags.Ephemeral });
        return;
      }
      void interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(`🎂 ${user}'s birthday is **${MONTH_NAMES[record.month - 1]} ${record.day}**`)],
      });
    }
  },
};

export default command;
