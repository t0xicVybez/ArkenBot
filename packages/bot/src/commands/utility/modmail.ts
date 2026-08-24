import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
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
        .addStringOption((o) => o.setName('greeting').setDescription('Message DM’d to the user when a thread opens'))
        .addIntegerOption((o) => o.setName('auto-close-hours').setDescription('Auto-close idle threads after N hours (0 = off)').setMinValue(0).setMaxValue(720))
        .addBooleanOption((o) => o.setName('feedback').setDescription('Ask the user to rate support when a thread closes (default: on)')))
    .addSubcommand((s) => s.setName('disable').setDescription('Turn modmail off'))
    .addSubcommand((s) => s.setName('config').setDescription('Show the current modmail configuration'))
    .addSubcommand((s) =>
      s.setName('close').setDescription('Close the current modmail thread (run inside a modmail channel)')
        .addStringOption((o) => o.setName('reason').setDescription('Reason (sent to the user)')))
    .addSubcommand((s) => s.setName('claim').setDescription('Claim the current modmail thread (run inside a modmail channel)'))
    .addSubcommand((s) =>
      s.setName('note').setDescription('Add a private staff note to this thread (not sent to the user)')
        .addStringOption((o) => o.setName('text').setDescription('The note').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('snippet').setDescription('Send a saved canned response to the user (run inside a modmail channel)')
        .addStringOption((o) => o.setName('name').setDescription('Snippet name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) =>
      s.setName('snippet-add').setDescription('Create or update a canned response')
        .addStringOption((o) => o.setName('name').setDescription('Snippet name').setRequired(true))
        .addStringOption((o) => o.setName('content').setDescription('Snippet text').setRequired(true)))
    .addSubcommand((s) =>
      s.setName('snippet-remove').setDescription('Delete a canned response')
        .addStringOption((o) => o.setName('name').setDescription('Snippet name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('snippets').setDescription('List saved canned responses'))
    .addSubcommand((s) =>
      s.setName('block').setDescription('Block a user from opening modmail threads')
        .addUserOption((o) => o.setName('user').setDescription('User to block').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason (staff-only)')))
    .addSubcommand((s) =>
      s.setName('unblock').setDescription('Unblock a user')
        .addUserOption((o) => o.setName('user').setDescription('User to unblock').setRequired(true))) as SlashCommandBuilder,

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

    if (sub === 'claim') {
      const res = await ModmailModule.claim(interaction.channelId, interaction.user.id, interaction.user.tag);
      if (res === 'none') { await interaction.reply({ content: t('modmail.notThread', loc), flags: MessageFlags.Ephemeral }); return; }
      if (res === 'already') { await interaction.reply({ content: t('modmail.alreadyClaimed', loc), flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ content: t('modmail.claimed', loc, { user: `<@${interaction.user.id}>` }) });
      return;
    }

    if (sub === 'note') {
      const thread = await prisma.modmailThread.findFirst({ where: { channelId: interaction.channelId, open: true } });
      if (!thread) { await interaction.reply({ content: t('modmail.notThread', loc), flags: MessageFlags.Ephemeral }); return; }
      const text = interaction.options.getString('text', true);
      const embed = new EmbedBuilder().setColor(0xfaa61a)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(t('modmail.noteTitle', loc)).setDescription(text).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'snippet') {
      const thread = await prisma.modmailThread.findFirst({ where: { channelId: interaction.channelId, open: true } });
      if (!thread) { await interaction.reply({ content: t('modmail.notThread', loc), flags: MessageFlags.Ephemeral }); return; }
      const name = interaction.options.getString('name', true);
      const snip = await prisma.modmailSnippet.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name } } });
      if (!snip) { await interaction.reply({ content: t('modmail.snippetMissing', loc), flags: MessageFlags.Ephemeral }); return; }
      const sent = await ModmailModule.sendSnippet(interaction.guild, interaction.channelId, snip.content);
      await interaction.reply({ content: sent ? t('modmail.snippetSent', loc) : t('modmail.snippetFailed', loc), flags: sent ? undefined : MessageFlags.Ephemeral });
      if (sent) {
        await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x5865f2).setAuthor({ name: interaction.user.tag }).setDescription(snip.content)] }).catch(() => {});
      }
      return;
    }

    if (!isManager) { await interaction.reply({ content: t('modmail.needManage', loc), flags: MessageFlags.Ephemeral }); return; }

    if (sub === 'snippet-add') {
      const name = interaction.options.getString('name', true).slice(0, 64);
      const content = interaction.options.getString('content', true);
      await prisma.modmailSnippet.upsert({
        where: { guildId_name: { guildId: interaction.guildId, name } },
        create: { guildId: interaction.guildId, name, content },
        update: { content },
      });
      await interaction.reply({ content: t('modmail.snippetSaved', loc, { name }), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'snippet-remove') {
      const name = interaction.options.getString('name', true);
      const res = await prisma.modmailSnippet.deleteMany({ where: { guildId: interaction.guildId, name } });
      await interaction.reply({ content: res.count > 0 ? t('modmail.snippetRemoved', loc, { name }) : t('modmail.snippetMissing', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'snippets') {
      const snips = await prisma.modmailSnippet.findMany({ where: { guildId: interaction.guildId }, orderBy: { name: 'asc' } });
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(t('modmail.snippetsTitle', loc))
        .setDescription(snips.length ? snips.map((s) => `**${s.name}** — ${s.content.slice(0, 80)}`).join('\n') : t('modmail.snippetsEmpty', loc));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'block') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? null;
      await prisma.modmailBlock.upsert({
        where: { guildId_userId: { guildId: interaction.guildId, userId: user.id } },
        create: { guildId: interaction.guildId, userId: user.id, blockedBy: interaction.user.id, reason },
        update: { blockedBy: interaction.user.id, reason },
      });
      await interaction.reply({ content: t('modmail.blocked', loc, { user: `<@${user.id}>` }), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'unblock') {
      const user = interaction.options.getUser('user', true);
      const res = await prisma.modmailBlock.deleteMany({ where: { guildId: interaction.guildId, userId: user.id } });
      await interaction.reply({ content: res.count > 0 ? t('modmail.unblocked', loc, { user: `<@${user.id}>` }) : t('modmail.notBlocked', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'setup') {
      const category = interaction.options.getChannel('category');
      const staffRole = interaction.options.getRole('staff-role');
      const logChannel = interaction.options.getChannel('log-channel');
      const anonymous = interaction.options.getBoolean('anonymous') ?? true;
      const greeting = interaction.options.getString('greeting') ?? null;
      const autoCloseHours = interaction.options.getInteger('auto-close-hours') ?? 0;
      const feedbackEnabled = interaction.options.getBoolean('feedback') ?? true;
      const data = {
        enabled: true,
        categoryId: category?.id ?? null,
        staffRoleId: staffRole?.id ?? null,
        logChannelId: logChannel?.id ?? null,
        anonymous,
        greeting,
        autoCloseHours,
        feedbackEnabled,
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
        { name: t('modmail.cfgAutoClose', loc), value: cfg?.autoCloseHours ? t('modmail.hoursValue', loc, { n: String(cfg.autoCloseHours) }) : no, inline: true },
        { name: t('modmail.cfgFeedback', loc), value: cfg?.feedbackEnabled ? yes : no, inline: true },
      );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, _client: BotClient): Promise<void> {
    if (!interaction.guildId) return interaction.respond([]);
    const focused = interaction.options.getFocused().toString().toLowerCase();
    const snips = await prisma.modmailSnippet.findMany({ where: { guildId: interaction.guildId }, take: 25, orderBy: { name: 'asc' } });
    await interaction.respond(snips.filter((s) => s.name.toLowerCase().includes(focused)).slice(0, 25).map((s) => ({ name: s.name, value: s.name })));
  },

  // Guild picker when a user DMs the bot from multiple modmail-enabled servers.
  async handleSelect(interaction: StringSelectMenuInteraction, client: BotClient): Promise<void> {
    if (!interaction.customId.startsWith('modmail:pick:')) return;
    const guildId = interaction.values[0];
    await interaction.update({ content: t('modmail.picked', await resolveUserLocale({ user: interaction.user, guildId, guildLocale: null })), components: [] }).catch(() => {});
    await ModmailModule.completePick(client, interaction.user, guildId);
  },

  // Post-close feedback rating buttons (DM'd to the user).
  async handleButton(interaction: ButtonInteraction, client: BotClient): Promise<void> {
    if (!interaction.customId.startsWith('modmail:rate:')) return;
    const [, , threadId, nStr] = interaction.customId.split(':');
    const rating = parseInt(nStr, 10);
    const loc = await resolveUserLocale({ user: interaction.user, guildId: null, guildLocale: null });
    const ok = await ModmailModule.recordRating(client, threadId, rating);
    await interaction.update({
      content: ok ? t('modmail.rateThanks', loc, { stars: '⭐'.repeat(rating) }) : t('modmail.rateAlready', loc),
      embeds: interaction.message.embeds,
      components: [],
    }).catch(() => {});
  },
};

export default command;
