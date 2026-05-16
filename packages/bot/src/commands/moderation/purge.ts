/**
 * /purge command — bulk-deletes up to 100 messages from a text channel with
 * optional filters for author, bot messages, or message content.
 */
import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false))
    .addBooleanOption(o => o.setName('bots').setDescription('Only delete bot messages').setRequired(false))
    .addStringOption(o => o.setName('contains').setDescription('Only delete messages containing this text').setRequired(false)),
  category: 'moderation',
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');
    const botsOnly = interaction.options.getBoolean('bots') ?? false;
    const contains = interaction.options.getString('contains');

    if (!interaction.channel?.isTextBased()) {
      await interaction.reply({ content: 'This command can only be used in text channels.', flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = [...messages.values()].slice(0, amount);

    if (user) toDelete = toDelete.filter(m => m.author.id === user.id);
    if (botsOnly) toDelete = toDelete.filter(m => m.author.bot);
    if (contains) toDelete = toDelete.filter(m => m.content.toLowerCase().includes(contains.toLowerCase()));

    // Discord's bulkDelete API rejects messages older than 14 days.
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    toDelete = toDelete.filter(m => m.createdTimestamp > twoWeeksAgo);

    if (toDelete.length === 0) {
      await interaction.editReply('No messages matched the filters (messages must be under 14 days old).');
      return;
    }

    const { TextChannel } = await import('discord.js');
    if (!(interaction.channel instanceof TextChannel)) {
      await interaction.editReply('Bulk delete is only available in text channels.');
      return;
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await interaction.editReply(`Deleted ${deleted.size} message${deleted.size !== 1 ? 's' : ''}.`);
  },
};

export default command;
