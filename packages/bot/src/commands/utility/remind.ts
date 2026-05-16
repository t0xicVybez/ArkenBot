/**
 * /remind command — stores a reminder in the database for delivery by the
 * background job scheduler. Maximum duration is 28 days.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';

/**
 * Parses a short duration string (e.g. `10m`, `2h`, `1d`) into milliseconds.
 * Returns null if the format is unrecognised.
 */
function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (unit[match[2].toLowerCase()] ?? 0);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(o => o.setName('time').setDescription('When to remind you (e.g. 10m, 2h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('What to remind you about').setRequired(true)),
  category: 'utility',
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const timeStr = interaction.options.getString('time', true);
    const message = interaction.options.getString('message', true);
    const ms = parseDuration(timeStr);

    if (!ms || ms < 10000) {
      await interaction.reply({ content: 'Invalid duration. Examples: `10m`, `2h`, `1d`, `7d`', flags: 64 });
      return;
    }
    if (ms > 28 * 24 * 3600000) {
      await interaction.reply({ content: 'Maximum reminder duration is 28 days.', flags: 64 });
      return;
    }

    const remindAt = new Date(Date.now() + ms);
    await prisma.reminder.create({
      data: {
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        channelId: interaction.channelId,
        message,
        remindAt,
      },
    });

    await interaction.reply({ content: `Reminder set! I'll remind you about "${message}" <t:${Math.floor(remindAt.getTime() / 1000)}:R>.`, flags: 64 });
  },
};

export default command;
