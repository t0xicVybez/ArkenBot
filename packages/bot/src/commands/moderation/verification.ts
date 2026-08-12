/**
 * /verification command — admin setup for the verification gate.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { prisma } from '../../database.js';
import type { Prisma } from '@prisma/client';
import { invalidateSettingsCache } from '../../utils/settings.js';
import { VerificationModule } from '../../modules/verification/VerificationModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Manage the verification gate')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Configure and enable the verification gate')
        .addRoleOption(o => o.setName('pending-role').setDescription('Role assigned on join (unverified)').setRequired(true))
        .addRoleOption(o => o.setName('member-role').setDescription('Role assigned after verification').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel containing the verify button').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Disable the verification gate')
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.Administrator],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ flags: 64 });
    const loc = await resolveUserLocale(interaction);

    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const pendingRole = interaction.options.getRole('pending-role', true);
      const memberRole = interaction.options.getRole('member-role', true);
      const channel = interaction.options.getChannel('channel', true);

      const settings = await prisma.guildSettings.findUnique({ where: { guildId: interaction.guildId! } });
      const extended = ((settings?.extended ?? {}) as Record<string, unknown>);

      extended.verification = {
        enabled: true,
        pendingRoleId: pendingRole.id,
        memberRoleId: memberRole.id,
        verifyChannelId: channel.id,
      };

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId! },
        data: { extended: extended as Prisma.InputJsonValue },
      });
      await invalidateSettingsCache(interaction.guildId!);

      // Send the verify panel to the configured channel
      const textChannel = interaction.guild!.channels.cache.get(channel.id) as TextChannel | undefined;
      if (textChannel?.isTextBased()) {
        await VerificationModule.sendVerifyPanel(textChannel as TextChannel, interaction.guild!);
      }

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.verification.enabledTitle', loc), t('cmd.verification.enabled', loc, { pending: `<@&${pendingRole.id}>`, member: `<@&${memberRole.id}>`, channel: `<#${channel.id}>` }))],
      });
    }

    if (sub === 'disable') {
      const settings = await prisma.guildSettings.findUnique({ where: { guildId: interaction.guildId! } });
      const extended = ((settings?.extended ?? {}) as Record<string, unknown>);
      delete extended.verification;

      await prisma.guildSettings.update({
        where: { guildId: interaction.guildId! },
        data: { extended: extended as Prisma.InputJsonValue },
      });
      await invalidateSettingsCache(interaction.guildId!);

      await interaction.editReply({ embeds: [successEmbed(t('cmd.verification.disabledTitle', loc), t('cmd.verification.disabled', loc))] });
    }
  },
};

export default command;
