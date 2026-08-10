import { type Guild, type GuildMember, EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { formatTemplate } from '@arkenbot/shared';
import { logger, swallow} from '../../logger.js';

export class WelcomeModule {
  static async handleJoin(guild: Guild, member: GuildMember): Promise<void> {
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.welcomeEnabled) return;

    const variables = {
      user: `@${member.displayName}`,
      username: member.user.username,
      server: guild.name,
      memberCount: guild.memberCount,
      userId: member.id,
    };

    const message = formatTemplate(config.welcomeMessage, variables);

    // Send to welcome channel
    if (config.welcomeChannelId) {
      const channel = guild.channels.cache.get(config.welcomeChannelId);
      if (channel?.isTextBased()) {
        const textChannel = channel as TextChannel;

        if (config.welcomeEmbed) {
          const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
          const accountAge = accountAgeDays >= 365
            ? `${Math.floor(accountAgeDays / 365)}y ${Math.floor((accountAgeDays % 365) / 30)}mo`
            : `${accountAgeDays}d`;

          const embed = new EmbedBuilder()
            .setColor(config.welcomeColor as `#${string}`)
            .setAuthor({
              name: member.user.username,
              iconURL: member.user.displayAvatarURL({ size: 64 }),
            })
            .setTitle(`👋 Welcome to ${guild.name}!`)
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: '📅 Account Age', value: accountAge, inline: true },
              { name: '👥 Member Count', value: `#${guild.memberCount}`, inline: true },
            )
            .setFooter({ text: `ID: ${member.id}`, iconURL: guild.iconURL() ?? undefined })
            .setTimestamp();

          await textChannel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(swallow);
        } else {
          await textChannel.send({ content: message }).catch(swallow);
        }
      }
    }

    // Send DM
    if (config.welcomeDMEnabled && config.welcomeDMMessage) {
      const dmMessage = formatTemplate(config.welcomeDMMessage, variables);
      await member.user.send({ content: dmMessage }).catch(swallow);
    }

    // Auto-role
    const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
    if (settings?.autoRoleId) {
      const role = guild.roles.cache.get(settings.autoRoleId);
      if (role && role.editable) {
        await member.roles.add(role, 'Auto-role on join').catch(swallow);
      }
    }
  }

  static async handleLeave(guild: Guild, member: GuildMember): Promise<void> {
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.leaveEnabled || !config.leaveChannelId) return;

    const channel = guild.channels.cache.get(config.leaveChannelId);
    if (!channel?.isTextBased()) return;

    const message = formatTemplate(config.leaveMessage, {
      user: member.user.tag,
      username: member.user.username,
      server: guild.name,
      memberCount: guild.memberCount,
      userId: member.id,
    });

    const leaveEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({
        name: member.user.username,
        iconURL: member.user.displayAvatarURL({ size: 64 }),
      })
      .setDescription(message)
      .setFooter({ text: `ID: ${member.id}`, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp();

    await (channel as TextChannel).send({ embeds: [leaveEmbed] }).catch(swallow);
  }
}
