/**
 * Verification gate module.
 *
 * On join, assigns a "pending" role and DMs the member with a link to the
 * verify channel. When the member clicks "Verify", the pending role is swapped
 * for the member role.
 */
import { type GuildMember, type ButtonInteraction, type TextChannel, type Guild, type Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getGuildSettings } from '../../utils/settings.js';
import { logger, swallow} from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

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
        await member.roles.add(pendingRole, 'Verification: pending role assigned on join').catch(swallow);
      }

      const loc = await resolveUserLocale({ user: member.user, guildId: member.guild.id, guildLocale: member.guild.preferredLocale });
      const channel = member.guild.channels.cache.get(config.verifyChannelId);
      const channelName = channel?.isTextBased() ? `#${(channel as TextChannel).name}` : t('verification.verifyChannelFallback', loc);

      await member.send(
        t('verification.dmWelcome', loc, { server: member.guild.name, channel: channelName })
      ).catch(swallow);
    } catch (err) {
      logger.error({ err, guildId: member.guild.id, userId: member.id }, 'VerificationModule.handleJoin error');
    }
  }

  static async handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
    if (interaction.customId !== 'verify:confirm') return;
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: t('verification.serverOnly', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const settings = await getGuildSettings(interaction.guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const config = extended.verification as Partial<VerificationConfig> | undefined;

      if (!config?.enabled) {
        await interaction.reply({ content: t('verification.notConfigured', loc), flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(swallow);
      if (!member) {
        await interaction.reply({ content: t('verification.fetchFailed', loc), flags: MessageFlags.Ephemeral });
        return;
      }

      if (config.pendingRoleId) {
        await member.roles.remove(config.pendingRoleId, 'Verification complete').catch(swallow);
      }
      if (config.memberRoleId) {
        await member.roles.add(config.memberRoleId, 'Verification complete').catch(swallow);
      }

      await interaction.reply({ content: t('verification.verified', loc), flags: MessageFlags.Ephemeral });
    } catch (err) {
      logger.error({ err }, 'VerificationModule.handleVerifyButton error');
      await interaction.reply({ content: t('verification.error', loc), flags: MessageFlags.Ephemeral }).catch(swallow);
    }
  }

  static async sendVerifyPanel(channel: TextChannel, guild: Guild): Promise<Message> {
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t('verification.panelTitle', loc))
      .setDescription(t('verification.panelDescription', loc))
      .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:confirm')
        .setLabel(t('verification.buttonLabel', loc))
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
    );

    return channel.send({ embeds: [embed], components: [row] });
  }
}
