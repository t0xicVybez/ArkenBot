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
import { prisma } from '../../database.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server'),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.reply({ content: t('common.notInServer', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = interaction.guild;
    await guild.fetch();

    const guildSettings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });

    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.isTextBased()).size;
    const voiceChannels = channels.filter((c) => c.isVoiceBased()).size;
    const categories = channels.filter((c) => c.type === 4).size;

    const roles = guild.roles.cache.size - 1; // The @everyone role is excluded from the displayed count.
    const emojis = guild.emojis.cache.size;

    const verificationLevels: Record<number, string> = {
      0: t('cmd.serverinfo.verifNone', loc),
      1: t('cmd.serverinfo.verifLow', loc),
      2: t('cmd.serverinfo.verifMedium', loc),
      3: t('cmd.serverinfo.verifHigh', loc),
      4: t('cmd.serverinfo.verifVeryHigh', loc),
    };

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL() ?? null)
      .addFields(
        { name: t('cmd.serverinfo.fieldId', loc), value: guild.id, inline: true },
        { name: t('cmd.serverinfo.fieldOwner', loc), value: `<@${guild.ownerId}>`, inline: true },
        { name: t('cmd.serverinfo.fieldCreated', loc), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: t('cmd.serverinfo.fieldMembers', loc), value: `${guild.memberCount}`, inline: true },
        { name: t('cmd.serverinfo.fieldBots', loc), value: `${guild.members.cache.filter((m) => m.user.bot).size}`, inline: true },
        { name: t('cmd.serverinfo.fieldVerification', loc), value: verificationLevels[guild.verificationLevel] ?? t('cmd.serverinfo.unknown', loc), inline: true },
        {
          name: t('cmd.serverinfo.fieldChannels', loc),
          value: t('cmd.serverinfo.channelsValue', loc, { text: textChannels, voice: voiceChannels, categories }),
        },
        { name: t('cmd.serverinfo.fieldRoles', loc), value: `${roles}`, inline: true },
        { name: t('cmd.serverinfo.fieldEmojis', loc), value: `${emojis}`, inline: true },
        { name: t('cmd.serverinfo.fieldBoosts', loc), value: t('cmd.serverinfo.boostsValue', loc, { tier: guild.premiumTier, count: guild.premiumSubscriptionCount ?? 0 }), inline: true },
      )
      .setFooter({ text: t('cmd.serverinfo.footer', loc, { id: guild.id }) })
      .setTimestamp();

    if (guildSettings) {
      const featureMap: [keyof typeof guildSettings, string][] = [
        ['moderationEnabled', t('cmd.serverinfo.featModeration', loc)],
        ['autoModEnabled', t('cmd.serverinfo.featAutoMod', loc)],
        ['levelingEnabled', t('cmd.serverinfo.featLeveling', loc)],
        ['welcomeEnabled', t('cmd.serverinfo.featWelcome', loc)],
        ['loggingEnabled', t('cmd.serverinfo.featLogging', loc)],
        ['musicEnabled', t('cmd.serverinfo.featMusic', loc)],
        ['reactionRolesEnabled', t('cmd.serverinfo.featReactionRoles', loc)],
      ];
      const enabled = featureMap.filter(([key]) => guildSettings[key] === true).map(([, label]) => `✅ ${label}`);
      const disabled = featureMap.filter(([key]) => guildSettings[key] !== true).map(([, label]) => `❌ ${label}`);
      embed.addFields({
        name: t('cmd.serverinfo.fieldFeatures', loc),
        value: [...enabled, ...disabled].join('\n') || t('cmd.serverinfo.noneConfigured', loc),
      });
    }

    if (guild.banner) {
      embed.setImage(guild.bannerURL({ size: 1024 }) ?? null);
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
