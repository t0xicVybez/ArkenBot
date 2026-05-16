import { SlashCommandBuilder, OAuth2Scopes, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { infoEmbed } from '../../utils/embed.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get a link to invite ArkenBot to your server'),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const url = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageThreads,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.CreateInstantInvite,
      ],
    });

    await interaction.reply({
      embeds: [infoEmbed('Invite ArkenBot', `[Click here to add ArkenBot to your server](${url})`)],
      ephemeral: true,
    });
  },
};

export default command;
