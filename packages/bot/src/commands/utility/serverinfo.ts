/**
 * /serverinfo command — displays an overview of the current guild: member counts,
 * channel breakdown, roles, boosts, verification level, and banner.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server'),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = interaction.guild;
    await guild.fetch();

    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.isTextBased()).size;
    const voiceChannels = channels.filter((c) => c.isVoiceBased()).size;
    const categories = channels.filter((c) => c.type === 4).size;

    const roles = guild.roles.cache.size - 1; // The @everyone role is excluded from the displayed count.
    const emojis = guild.emojis.cache.size;

    const verificationLevels: Record<number, string> = {
      0: 'None',
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Very High',
    };

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL() ?? null)
      .addFields(
        { name: '🆔 ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
        { name: '🤖 Bots', value: `${guild.members.cache.filter((m) => m.user.bot).size}`, inline: true },
        { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel] ?? 'Unknown', inline: true },
        {
          name: '📋 Channels',
          value: `💬 ${textChannels} text | 🔊 ${voiceChannels} voice | 📁 ${categories} categories`,
        },
        { name: '🎭 Roles', value: `${roles}`, inline: true },
        { name: '😀 Emojis', value: `${emojis}`, inline: true },
        { name: '💎 Boosts', value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`, inline: true },
      )
      .setFooter({ text: `Server ID: ${guild.id}` })
      .setTimestamp();

    if (guild.banner) {
      embed.setImage(guild.bannerURL({ size: 1024 }) ?? null);
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
