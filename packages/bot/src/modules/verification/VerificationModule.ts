/**
 * Verification gate module.
 *
 * On join, assigns a "pending" role and DMs the member with a link to the
 * verify channel. When the member clicks "Verify", the pending role is swapped
 * for the member role.
 */
import { type GuildMember, type ButtonInteraction, type TextChannel, type Guild, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getGuildSettings } from '../../utils/settings.js';
import { logger } from '../../logger.js';

interface VerificationConfig {
  enabled: boolean;
  pendingRoleId: string;
  memberRoleId: string;
  verifyChannelId: string;
}

export class VerificationModule {
  static async handleJoin(member: GuildMember): Promise<void> {
    try {
      const settings = await getGuildSettings(member.guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const config = extended.verification as Partial<VerificationConfig> | undefined;

      if (!config?.enabled || !config.pendingRoleId || !config.verifyChannelId) return;

      const pendingRole = member.guild.roles.cache.get(config.pendingRoleId);
      if (pendingRole) {
        await member.roles.add(pendingRole, 'Verification: pending role assigned on join').catch(() => null);
      }

      const channel = member.guild.channels.cache.get(config.verifyChannelId);
      const channelName = channel?.isTextBased() ? `#${(channel as TextChannel).name}` : 'the verify channel';

      await member.send(
        `Welcome to **${member.guild.name}**! Please click the Verify button in ${channelName} to gain access.`
      ).catch(() => null);
    } catch (err) {
      logger.error({ err, guildId: member.guild.id, userId: member.id }, 'VerificationModule.handleJoin error');
    }
  }

  static async handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
    if (interaction.customId !== 'verify:confirm') return;
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: 'This button can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const settings = await getGuildSettings(interaction.guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const config = extended.verification as Partial<VerificationConfig> | undefined;

      if (!config?.enabled) {
        await interaction.reply({ content: 'Verification is not configured on this server.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Could not fetch your member data.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (config.pendingRoleId) {
        await member.roles.remove(config.pendingRoleId, 'Verification complete').catch(() => null);
      }
      if (config.memberRoleId) {
        await member.roles.add(config.memberRoleId, 'Verification complete').catch(() => null);
      }

      await interaction.reply({ content: '✅ Verified! Welcome to the server.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      logger.error({ err }, 'VerificationModule.handleVerifyButton error');
      await interaction.reply({ content: 'An error occurred during verification.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  }

  static async sendVerifyPanel(channel: TextChannel, guild: Guild): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('✅ Verify Your Account')
      .setDescription('Click the button below to verify yourself and gain access to the server.')
      .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:confirm')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
    );

    await channel.send({ embeds: [embed], components: [row] });
  }
}
