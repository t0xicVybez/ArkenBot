/**
 * /suggest command — submits a member's suggestion to the configured suggestions
 * channel. Adds voting reactions if the guild has voting enabled.
 */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion for this server')
    .addStringOption(o => o.setName('suggestion').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)),
  category: 'utility',
  cooldown: 30,
  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const content = interaction.options.getString('suggestion', true);
    const config = await prisma.suggestionConfig.findUnique({ where: { guildId: interaction.guildId! } });

    if (!config?.enabled || !config.channelId) {
      await interaction.reply({ content: 'Suggestions are not enabled in this server.', flags: 64 });
      return;
    }

    const channel = interaction.guild!.channels.cache.get(config.channelId);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Suggestion channel not found.', flags: 64 });
      return;
    }

    const suggestion = await prisma.suggestion.create({
      data: { guildId: interaction.guildId!, userId: interaction.user.id, username: interaction.user.username, content, channelId: config.channelId },
    });

    const embed = new EmbedBuilder()
      .setTitle('New Suggestion')
      .setDescription(content)
      .setColor(0x5865f2)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: `Suggestion ID: ${suggestion.id}` })
      .setTimestamp();

    const msg = await channel.send({ embeds: [embed] });
    if (config.allowVoting) {
      await msg.react('👍');
      await msg.react('👎');
    }

    await prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: msg.id } });
    await interaction.reply({ content: 'Your suggestion has been submitted!', flags: 64 });
  },
};

export default command;
