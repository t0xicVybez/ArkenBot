/**
 * Modmail — DM-based private support. A member DMs the bot; the bot opens a
 * dedicated staff channel in the server and relays messages both ways. Staff
 * can reply anonymously and close the thread, which DMs the member and posts a
 * transcript to the configured log channel.
 *
 * Routing: if the member already has an open thread, new DMs go there. Otherwise
 * we look at which modmail-enabled servers they share with the bot — one match
 * auto-routes; several show a picker.
 */
import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type Guild,
  type User,
  type TextChannel,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';

const MODMAIL_COLOR = 0x5865f2;

export class ModmailModule {
  /** In-memory set of open modmail thread channel IDs — avoids a DB hit per message. */
  private static openChannels = new Set<string>();

  /** Load open thread channels on startup so the per-message check is synchronous. */
  static async loadOpenThreads(): Promise<void> {
    const rows = await prisma.modmailThread.findMany({ where: { open: true }, select: { channelId: true } }).catch(() => []);
    this.openChannels = new Set(rows.map((r) => r.channelId));
    logger.info({ count: this.openChannels.size }, 'Modmail: loaded open threads');
  }

  /** Synchronous check used in the message hot path. */
  static hasOpenThread(channelId: string): boolean {
    return this.openChannels.has(channelId);
  }

  /** Handle a DM from a user — route to (or open) a modmail thread. */
  static async handleUserDM(client: BotClient, message: Message): Promise<void> {
    if (message.author.bot || message.guild) return;
    const content = message.content?.trim() ?? '';
    const attachments = [...message.attachments.values()].map((a) => a.url);
    if (!content && !attachments.length) return;

    // 1. Existing open thread → relay straight there (unless blocked in that guild).
    const open = await prisma.modmailThread.findFirst({ where: { userId: message.author.id, open: true } });
    if (open) {
      const blk = await prisma.modmailBlock.findUnique({ where: { guildId_userId: { guildId: open.guildId, userId: message.author.id } } });
      if (blk) { await message.react('🚫').catch(swallow); return; }
      await this.relayUserToChannel(client, message, open.guildId, open.channelId);
      return;
    }

    // 2. Find modmail-enabled servers the user shares with the bot (excluding ones they're blocked in).
    const configs = await prisma.modmailConfig.findMany({ where: { enabled: true }, select: { guildId: true } });
    const candidates: Guild[] = [];
    for (const cfg of configs) {
      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;
      const member = guild.members.cache.get(message.author.id) ?? (await guild.members.fetch(message.author.id).catch(() => null));
      if (!member) continue;
      const blk = await prisma.modmailBlock.findUnique({ where: { guildId_userId: { guildId: cfg.guildId, userId: message.author.id } } });
      if (!blk) candidates.push(guild);
    }

    const loc = await resolveUserLocale({ user: message.author, guildId: '', guildLocale: null });
    if (candidates.length === 0) {
      await message.reply(t('modmail.noServer', loc)).catch(swallow);
      return;
    }
    if (candidates.length === 1) {
      await this.openThread(client, candidates[0], message.author, message, loc);
      return;
    }
    // 3. Multiple → let them pick.
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`modmail:pick:${message.author.id}`)
      .setPlaceholder(t('modmail.pickPlaceholder', loc))
      .addOptions(candidates.slice(0, 25).map((g) => ({ label: g.name.slice(0, 100), value: g.id })));
    await message.reply({
      content: t('modmail.pickPrompt', loc),
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    }).catch(swallow);
    // Stash the pending message so the picker can deliver it.
    await prisma.modmailThread.create({
      data: { guildId: '__pending__', userId: message.author.id, userTag: message.author.tag, channelId: content.slice(0, 1900) || '(attachment)', open: false },
    }).catch(swallow);
  }

  /** Finish routing after a multi-guild picker selection. */
  static async completePick(client: BotClient, user: User, guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const loc = await resolveUserLocale({ user, guildId, guildLocale: guild.preferredLocale });
    const pending = await prisma.modmailThread.findFirst({ where: { guildId: '__pending__', userId: user.id }, orderBy: { createdAt: 'desc' } });
    await this.openThread(client, guild, user, null, loc, pending?.channelId);
    if (pending) await prisma.modmailThread.delete({ where: { id: pending.id } }).catch(swallow);
  }

  /** Create the staff channel and announce the new thread. */
  private static async openThread(client: BotClient, guild: Guild, user: User, message: Message | null, loc: string, firstText?: string): Promise<void> {
    const config = await prisma.modmailConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.enabled) return;
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await user.send(t('modmail.cantOpen', loc, { server: guild.name })).catch(swallow);
      return;
    }

    const overwrites: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
    ];
    if (config.staffRoleId) overwrites.push({ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

    const channel = await guild.channels.create({
      name: `modmail-${user.username}`.slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      type: ChannelType.GuildText,
      parent: config.categoryId ?? undefined,
      topic: `Modmail with ${user.tag} (${user.id})`,
      permissionOverwrites: overwrites,
    }).catch((e) => { void notifyActionFailure(guild, { action: 'manageChannels', error: e, requiredPermission: 'Manage Channels' }); return null; });
    if (!channel) return;

    await prisma.modmailThread.create({ data: { guildId: guild.id, userId: user.id, userTag: user.tag, channelId: channel.id, open: true } });
    this.openChannels.add(channel.id);

    const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    await channel.send({
      content: config.staffRoleId ? `<@&${config.staffRoleId}>` : undefined,
      embeds: [new EmbedBuilder().setColor(MODMAIL_COLOR)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setTitle(t('modmail.newThreadTitle', staffLoc))
        .setDescription(t('modmail.newThreadDesc', staffLoc, { user: `<@${user.id}>`, id: user.id }))
        .setFooter({ text: t('modmail.replyHint', staffLoc) })
        .setTimestamp()],
      allowedMentions: config.staffRoleId ? { roles: [config.staffRoleId] } : { parse: [] },
    }).catch(swallow);

    // Greeting DM + the user's first message relayed in.
    await user.send({ embeds: [new EmbedBuilder().setColor(MODMAIL_COLOR).setTitle(t('modmail.openedTitle', loc, { server: guild.name })).setDescription(config.greeting || t('modmail.openedDesc', loc, { server: guild.name }))] }).catch(swallow);
    const text = message?.content?.trim() ?? firstText ?? '';
    if (text || (message && message.attachments.size)) {
      await this.postUserMessage(channel as TextChannel, user, text, message ? [...message.attachments.values()].map((a) => a.url) : []);
    }
  }

  /** Relay a user's DM to the existing thread channel. */
  private static async relayUserToChannel(client: BotClient, message: Message, guildId: string, channelId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      // Channel gone — close the stale thread.
      await prisma.modmailThread.updateMany({ where: { channelId, open: true }, data: { open: false, closedAt: new Date() } }).catch(swallow);
      this.openChannels.delete(channelId);
      return;
    }
    await this.postUserMessage(channel, message.author, message.content?.trim() ?? '', [...message.attachments.values()].map((a) => a.url));
    await prisma.modmailThread.updateMany({ where: { channelId, open: true }, data: { lastActivity: new Date() } }).catch(swallow);
    await message.react('📨').catch(swallow);
  }

  private static async postUserMessage(channel: TextChannel, user: User, text: string, attachments: string[]): Promise<void> {
    const embed = new EmbedBuilder().setColor(0x2ecc71)
      .setAuthor({ name: `${user.tag} (${user.id})`, iconURL: user.displayAvatarURL() })
      .setDescription(text || '*(no text)*')
      .setTimestamp();
    if (attachments.length) embed.addFields({ name: 'Attachments', value: attachments.join('\n').slice(0, 1024) });
    await channel.send({ embeds: [embed] }).catch(swallow);
  }

  /** A staff message in a modmail channel → relay to the user's DM. */
  static async handleStaffMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) return;
    if (message.content.startsWith('/') || message.content.startsWith('!')) return; // let commands through
    const thread = await prisma.modmailThread.findFirst({ where: { channelId: message.channel.id, open: true } });
    if (!thread) return;
    const config = await prisma.modmailConfig.findUnique({ where: { guildId: message.guild.id } });

    const user = await message.client.users.fetch(thread.userId).catch(() => null);
    if (!user) { await message.react('⚠️').catch(swallow); return; }
    const loc = await resolveUserLocale({ user: { id: thread.userId }, guildId: message.guild.id, guildLocale: message.guild.preferredLocale });

    const anon = config?.anonymous ?? true;
    const embed = new EmbedBuilder().setColor(MODMAIL_COLOR)
      .setAuthor({ name: anon ? message.guild.name : `${message.author.tag} • ${message.guild.name}`, iconURL: (anon ? message.guild.iconURL() : message.author.displayAvatarURL()) ?? undefined })
      .setDescription(message.content || '*(no text)*')
      .setFooter({ text: t('modmail.staffReplyFooter', loc, { server: message.guild.name }) })
      .setTimestamp();
    const att = [...message.attachments.values()].map((a) => a.url);
    if (att.length) embed.addFields({ name: 'Attachments', value: att.join('\n').slice(0, 1024) });

    const sent = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
    if (sent) await prisma.modmailThread.update({ where: { id: thread.id }, data: { lastActivity: new Date() } }).catch(swallow);
    await message.react(sent ? '✅' : '❌').catch(swallow);
  }

  /** Send a saved snippet to the user as a staff reply (invoked from /modmail snippet). */
  static async sendSnippet(guild: Guild, channelId: string, content: string): Promise<boolean> {
    const thread = await prisma.modmailThread.findFirst({ where: { channelId, open: true } });
    if (!thread) return false;
    const config = await prisma.modmailConfig.findUnique({ where: { guildId: guild.id } });
    const user = await guild.client.users.fetch(thread.userId).catch(() => null);
    if (!user) return false;
    const loc = await resolveUserLocale({ user: { id: thread.userId }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const anon = config?.anonymous ?? true;
    const embed = new EmbedBuilder().setColor(MODMAIL_COLOR)
      .setAuthor({ name: anon ? guild.name : guild.name, iconURL: guild.iconURL() ?? undefined })
      .setDescription(content)
      .setFooter({ text: t('modmail.staffReplyFooter', loc, { server: guild.name }) })
      .setTimestamp();
    const sent = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
    if (sent) await prisma.modmailThread.update({ where: { id: thread.id }, data: { lastActivity: new Date() } }).catch(swallow);
    return sent;
  }

  /** Mark a thread as claimed by a staff member. Returns false if already claimed by someone else. */
  static async claim(channelId: string, staffId: string, staffTag: string): Promise<'claimed' | 'already' | 'none'> {
    const thread = await prisma.modmailThread.findFirst({ where: { channelId, open: true } });
    if (!thread) return 'none';
    if (thread.claimedBy && thread.claimedBy !== staffId) return 'already';
    await prisma.modmailThread.update({ where: { id: thread.id }, data: { claimedBy: staffId, claimedByTag: staffTag } });
    return 'claimed';
  }

  /** Close a thread: DM the user, post a transcript, delete the channel. */
  static async closeThread(client: BotClient, channelId: string, closedByTag: string, reason?: string): Promise<boolean> {
    const thread = await prisma.modmailThread.findFirst({ where: { channelId, open: true } });
    if (!thread) return false;
    const guild = client.guilds.cache.get(thread.guildId);
    const channel = guild?.channels.cache.get(channelId) as TextChannel | undefined;
    const config = guild ? await prisma.modmailConfig.findUnique({ where: { guildId: guild.id } }) : null;

    await prisma.modmailThread.update({ where: { id: thread.id }, data: { open: false, closedBy: closedByTag, closedAt: new Date() } });
    this.openChannels.delete(channelId);

    // DM the user (with an optional feedback rating prompt).
    const user = await client.users.fetch(thread.userId).catch(() => null);
    if (user && guild) {
      const loc = await resolveUserLocale({ user: { id: user.id }, guildId: guild.id, guildLocale: guild.preferredLocale });
      const closeEmbed = new EmbedBuilder().setColor(0xed4245).setTitle(t('modmail.closedTitle', loc, { server: guild.name })).setDescription(reason ? t('modmail.closedReason', loc, { reason }) : t('modmail.closedDesc', loc, { server: guild.name }));
      const components: ActionRowBuilder<ButtonBuilder>[] = [];
      if (config?.feedbackEnabled) {
        closeEmbed.addFields({ name: t('modmail.ratePrompt', loc), value: t('modmail.rateHint', loc) });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          [1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`modmail:rate:${thread.id}:${n}`).setLabel('⭐'.repeat(n)).setStyle(ButtonStyle.Secondary)),
        );
        components.push(row);
      }
      await user.send({ embeds: [closeEmbed], components }).catch(swallow);
    }

    // Transcript to the log channel.
    if (guild && config?.logChannelId && channel) {
      const logCh = guild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
      if (logCh?.isTextBased()) {
        const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        const lines = msgs ? [...msgs.values()].reverse().map((m) => `[${m.author.tag}] ${m.embeds[0]?.description ?? m.content}`).join('\n') : '';
        const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
        const embed = new EmbedBuilder().setColor(0x99aab5)
          .setTitle(t('modmail.transcriptTitle', staffLoc, { user: thread.userTag }))
          .setDescription(t('modmail.transcriptMeta', staffLoc, { user: thread.userTag, closedBy: closedByTag }))
          .setTimestamp();
        const files = lines ? [{ attachment: Buffer.from(lines, 'utf8'), name: `modmail-${thread.userTag}.txt` }] : [];
        await logCh.send({ embeds: [embed], files }).catch(swallow);
      }
    }

    await channel?.delete('Modmail thread closed').catch(swallow);
    return true;
  }

  /** Store a user's post-close star rating and forward it to the guild's log channel. */
  static async recordRating(client: BotClient, threadId: string, rating: number): Promise<boolean> {
    const thread = await prisma.modmailThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.rating != null) return false;
    await prisma.modmailThread.update({ where: { id: threadId }, data: { rating } });
    const guild = client.guilds.cache.get(thread.guildId);
    const config = guild ? await prisma.modmailConfig.findUnique({ where: { guildId: guild.id } }) : null;
    if (guild && config?.logChannelId) {
      const logCh = guild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
      if (logCh?.isTextBased()) {
        const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
        await logCh.send({ embeds: [new EmbedBuilder().setColor(0xf1c40f)
          .setTitle(t('modmail.ratingLogTitle', staffLoc))
          .setDescription(t('modmail.ratingLog', staffLoc, { user: thread.userTag, stars: '⭐'.repeat(rating), rating: String(rating) }))
          .setTimestamp()] }).catch(swallow);
      }
    }
    return true;
  }

  /**
   * Auto-close threads that have been idle past their guild's autoCloseHours.
   * Invoked periodically by BackgroundJobs.
   */
  static async closeIdleThreads(client: BotClient): Promise<void> {
    const configs = await prisma.modmailConfig.findMany({ where: { enabled: true, autoCloseHours: { gt: 0 } } }).catch(() => []);
    for (const cfg of configs) {
      const cutoff = new Date(Date.now() - cfg.autoCloseHours * 60 * 60 * 1000);
      const stale = await prisma.modmailThread.findMany({ where: { guildId: cfg.guildId, open: true, lastActivity: { lt: cutoff } } }).catch(() => []);
      for (const thread of stale) {
        await this.closeThread(client, thread.channelId, 'Auto-close (inactivity)').catch(swallow);
      }
    }
  }

}
