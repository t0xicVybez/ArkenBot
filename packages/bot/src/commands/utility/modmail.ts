import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { ModmailModule } from '../../modules/modmail/ModmailModule.js';

const command: BotCommand = {
  category: 'Utility',
  data: new SlashCommandBuilder()
    .setName('modmail')
    .setDescription('Set up and manage DM-based modmail support')
    .addSubcommand((s) =>
      s.setName('setup').setDescription('Enable modmail and configure it')
        .addChannelOption((o) => o.setName('category').setDescription('Category new modmail channels are created under').addChannelTypes(ChannelType.GuildCategory))
        .addRoleOption((o) => o.setName('staff-role').setDescription('Role pinged on new modmail threads'))
        .addChannelOption((o) => o.setName('log-channel').setDescription('Channel where closed-thread transcripts are posted').addChannelTypes(ChannelType.GuildText))
        .addBooleanOption((o) => o.setName('anonymous').setDescription('Hide individual staff identities from the user (default: on)'))
        .addStringOption((o) => o.setName('greeting').setDescription('Message DM’d to the user when a thread opens')))
    .addSubcommand((s) => s.setName('disable').setDescription('Turn modmail off'))
    .addSubcommand((s) => s.setName('config').setDescription('Show the current modmail configuration'))
    .addSubcommand((s) =>
      s.setName('close').setDescription('Close the current modmail thread (run inside a modmail channel)')
        .addStringOption((o) => o.setName('reason').setDescription('Reason (sent to the user)'))) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<void> {
    if (!interaction.guildId || !interaction.guild) return;
    const loc = await resolveUserLocale(interaction);
    const sub = interaction.options.getSubcommand();
    const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

    if (sub === 'close') {
      const ok = await ModmailModule.closeThread(client, interaction.channelId, interaction.user.tag, interaction.options.getString('reason') ?? undefined);
      await interaction.reply({ content: ok ? t('modmail.closing', loc) : t('modmail.notThread', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    if (!isManager) { await interaction.reply({ content: t('modmail.needManage', loc), flags: MessageFlags.Ephemeral }); return; }

    if (sub === 'setup') {
      const category = interaction.options.getChannel('category');
      const staffRole = interaction.options.getRole('staff-role');
      const logChannel = interaction.options.getChannel('log-channel');
      const anonymous = interaction.options.getBoolean('anonymous') ?? true;
      const greeting = interaction.options.getString('greeting') ?? null;
      const data = {
        enabled: true,
        categoryId: category?.id ?? null,
        staffRoleId: staffRole?.id ?? null,
        logChannelId: logChannel?.id ?? null,
        anonymous,
        greeting,
      };
      await prisma.modmailConfig.upsert({ where: { guildId: interaction.guildId }, create: { guildId: interaction.guildId, ...data }, update: data });
      await interaction.reply({ content: t('modmail.setupDone', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'disable') {
      await prisma.modmailConfig.upsert({ where: { guildId: interaction.guildId }, create: { guildId: interaction.guildId, enabled: false }, update: { enabled: false } });
      await interaction.reply({ content: t('modmail.disabled', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'config') {
      const cfg = await prisma.modmailConfig.findUnique({ where: { guildId: interaction.guildId } });
      const yes = t('modmail.on', loc), no = t('modmail.off', loc), none = t('modmail.none', loc);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(t('modmail.configTitle', loc)).addFields(
        { name: t('modmail.cfgEnabled', loc), value: cfg?.enabled ? yes : no, inline: true },
        { name: t('modmail.cfgCategory', loc), value: cfg?.categoryId ? `<#${cfg.categoryId}>` : none, inline: true },
        { name: t('modmail.cfgStaff', loc), value: cfg?.staffRoleId ? `<@&${cfg.staffRoleId}>` : none, inline: true },
        { name: t('modmail.cfgLog', loc), value: cfg?.logChannelId ? `<#${cfg.logChannelId}>` : none, inline: true },
        { name: t('modmail.cfgAnon', loc), value: cfg?.anonymous ? yes : no, inline: true },
      );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },

  // Guild picker when a user DMs the bot from multiple modmail-enabled servers.
  async handleSelect(interaction: StringSelectMenuInteraction, client: BotClient): Promise<void> {
    if (!interaction.customId.startsWith('modmail:pick:')) return;
    const guildId = interaction.values[0];
    await interaction.update({ content: t('modmail.picked', await resolveUserLocale({ user: interaction.user, guildId, guildLocale: null })), components: [] }).catch(() => {});
    await ModmailModule.completePick(client, interaction.user, guildId);
  },
};

export default command;
