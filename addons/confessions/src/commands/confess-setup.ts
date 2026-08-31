import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getConfig, saveConfig, findByNumber } from '../utils/storage.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('confess-setup')
    .setDescription('Configure the anonymous confessions system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('channel').setDescription('Set the channel where confessions are posted')
      .addChannelOption((o) => o.setName('channel').setDescription('The public confessions channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('review').setDescription('Require staff approval before posting (omit channel to turn off)')
      .addChannelOption((o) => o.setName('channel').setDescription('Staff review channel (leave empty to disable approval)').addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand((s) => s.setName('replies').setDescription('Open a reply thread on each confession')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Allow reply threads').setRequired(true)))
    .addSubcommand((s) => s.setName('cooldown').setDescription('Seconds a user must wait between confessions')
      .addIntegerOption((o) => o.setName('seconds').setDescription('0–3600 seconds').setMinValue(0).setMaxValue(3600).setRequired(true)))
    .addSubcommand((s) => s.setName('block').setDescription('Block a user from submitting confessions')
      .addUserOption((o) => o.setName('user').setDescription('User to block').setRequired(true)))
    .addSubcommand((s) => s.setName('unblock').setDescription('Unblock a user')
      .addUserOption((o) => o.setName('user').setDescription('User to unblock').setRequired(true)))
    .addSubcommand((s) => s.setName('whois').setDescription('Reveal who submitted a confession (abuse handling)')
      .addIntegerOption((o) => o.setName('number').setDescription('The confession number').setMinValue(1).setRequired(true)))
    .addSubcommand((s) => s.setName('status').setDescription('Show the current confessions configuration'))
    .addSubcommand((s) => s.setName('disable').setDescription('Turn off the confessions system')) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!guildId) {
      await interaction.reply({ content: t('guildOnly'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: t('needManage'), flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await getConfig(ctx.storage, guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'channel') {
      const ch = interaction.options.getChannel('channel', true);
      config.channelId = ch.id;
      await saveConfig(ctx.storage, guildId, config);
      await interaction.reply({ content: t('channelSet', { channel: `<#${ch.id}>` }), flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'review') {
      const ch = interaction.options.getChannel('channel', false);
      config.reviewChannelId = ch?.id;
      await saveConfig(ctx.storage, guildId, config);
      await interaction.reply({ content: ch ? t('reviewSet', { channel: `<#${ch.id}>` }) : t('reviewOff'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'replies') {
      config.allowReplies = interaction.options.getBoolean('enabled', true);
      await saveConfig(ctx.storage, guildId, config);
      await interaction.reply({ content: config.allowReplies ? t('repliesOn') : t('repliesOff'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'cooldown') {
      config.cooldownSec = interaction.options.getInteger('seconds', true);
      await saveConfig(ctx.storage, guildId, config);
      await interaction.reply({ content: t('cooldownSet', { seconds: config.cooldownSec }), flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'block' || sub === 'unblock') {
      const user = interaction.options.getUser('user', true);
      const has = config.blocked.includes(user.id);
      if (sub === 'block') {
        if (!has) config.blocked.push(user.id);
        await saveConfig(ctx.storage, guildId, config);
        await interaction.reply({ content: t('userBlocked', { user: `<@${user.id}>` }), flags: MessageFlags.Ephemeral });
      } else {
        config.blocked = config.blocked.filter((id) => id !== user.id);
        await saveConfig(ctx.storage, guildId, config);
        await interaction.reply({ content: t('userUnblocked', { user: `<@${user.id}>` }), flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (sub === 'whois') {
      const number = interaction.options.getInteger('number', true);
      const record = await findByNumber(ctx.storage, guildId, number);
      if (!record) {
        await interaction.reply({ content: t('whoisNotFound', { number }), flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: t('whoisResult', { number, user: `<@${record.userId}>`, id: record.userId }), flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'disable') {
      config.channelId = undefined;
      await saveConfig(ctx.storage, guildId, config);
      await interaction.reply({ content: t('disabled'), flags: MessageFlags.Ephemeral });
      return;
    }

    // status
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(t('statusTitle'))
      .addFields(
        { name: t('statusChannel'), value: config.channelId ? `<#${config.channelId}>` : t('statusNone'), inline: true },
        { name: t('statusReview'), value: config.reviewChannelId ? `<#${config.reviewChannelId}>` : t('statusOff'), inline: true },
        { name: t('statusReplies'), value: config.allowReplies ? t('statusOn') : t('statusOff'), inline: true },
        { name: t('statusCooldown'), value: t('statusSeconds', { seconds: config.cooldownSec }), inline: true },
        { name: t('statusBlocked'), value: String(config.blocked.length), inline: true },
        { name: t('statusTotal'), value: String(config.counter), inline: true },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
