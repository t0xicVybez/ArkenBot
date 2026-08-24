/**
 * EventsModule — scheduled events with RSVP buttons.
 * Members RSVP Going / Maybe / Can't; "Going" optionally grants a role. A
 * reminder is sent to the event channel shortly before it starts.
 */
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  type ButtonInteraction, type Guild, type TextChannel,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { COLORS } from '@arkenbot/shared';
import { swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import type { ScheduledEvent, EventRsvp } from '@prisma/client';

const STATUSES = ['going', 'maybe', 'no'] as const;

export class EventsModule {
  static buildEmbed(event: ScheduledEvent, rsvps: EventRsvp[], loc: string): EmbedBuilder {
    const unix = Math.floor(event.startsAt.getTime() / 1000);
    const counts = { going: 0, maybe: 0, no: 0 } as Record<string, number>;
    const lists = { going: [] as string[], maybe: [] as string[], no: [] as string[] };
    for (const r of rsvps) { counts[r.status] = (counts[r.status] ?? 0) + 1; if (lists[r.status as keyof typeof lists]?.length < 20) lists[r.status as keyof typeof lists]?.push(`<@${r.userId}>`); }

    const embed = new EmbedBuilder()
      .setColor(event.cancelled ? COLORS.ERROR : COLORS.INFO)
      .setTitle(`📅 ${event.title}${event.cancelled ? ` — ${t('events.cancelledTag', loc)}` : ''}`)
      .addFields(
        { name: t('events.when', loc), value: `<t:${unix}:F> · <t:${unix}:R>`, inline: false },
      );
    if (event.description) embed.setDescription(event.description);
    if (event.location) embed.addFields({ name: t('events.location', loc), value: event.location, inline: true });
    embed.addFields(
      { name: `✅ ${t('events.going', loc)} (${counts.going})`, value: lists.going.join(' ') || '—', inline: false },
      { name: `❔ ${t('events.maybe', loc)} (${counts.maybe})`, value: lists.maybe.join(' ') || '—', inline: false },
      { name: `❌ ${t('events.no', loc)} (${counts.no})`, value: lists.no.join(' ') || '—', inline: false },
    );
    if (event.roleId) embed.setFooter({ text: t('events.roleFooter', loc) });
    return embed;
  }

  static components(eventId: string, loc: string, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`event:rsvp:${eventId}:going`).setLabel(t('events.going', loc)).setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`event:rsvp:${eventId}:maybe`).setLabel(t('events.maybe', loc)).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`event:rsvp:${eventId}:no`).setLabel(t('events.no', loc)).setStyle(ButtonStyle.Danger).setDisabled(disabled),
    )];
  }

  /** `event:rsvp:<eventId>:<status>` — record/toggle an RSVP and update the message. */
  static async handleRsvp(interaction: ButtonInteraction): Promise<void> {
    const [, , eventId, status] = interaction.customId.split(':');
    const loc = await resolveUserLocale({ user: interaction.user, guildId: interaction.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    if (!STATUSES.includes(status as typeof STATUSES[number])) return;
    const event = await prisma.scheduledEvent.findUnique({ where: { id: eventId } });
    if (!event || event.cancelled) { await interaction.reply({ content: t('events.gone', loc), ephemeral: true }).catch(() => {}); return; }

    const existing = await prisma.eventRsvp.findUnique({ where: { eventId_userId: { eventId, userId: interaction.user.id } } });
    // Clicking your current status again clears the RSVP.
    if (existing?.status === status) await prisma.eventRsvp.delete({ where: { id: existing.id } });
    else await prisma.eventRsvp.upsert({ where: { eventId_userId: { eventId, userId: interaction.user.id } }, create: { eventId, userId: interaction.user.id, status }, update: { status } });

    // Sync the "going" role.
    if (event.roleId && interaction.guild) {
      const wantRole = existing?.status !== status && status === 'going';
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      const role = interaction.guild.roles.cache.get(event.roleId);
      const me = interaction.guild.members.me;
      if (member && role && me?.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
        if (wantRole) await member.roles.add(role, 'Event RSVP: going').catch((e) => notifyActionFailure(interaction.guild!, { action: 'manageRoles', error: e, target: role.id }));
        else await member.roles.remove(role, 'Event RSVP changed').catch(swallow);
      }
    }

    const rsvps = await prisma.eventRsvp.findMany({ where: { eventId } });
    const staffLoc = await resolveUserLocale({ user: { id: '' }, guildId: event.guildId, guildLocale: interaction.guild?.preferredLocale ?? null });
    await interaction.update({ embeds: [this.buildEmbed(event, rsvps, staffLoc)], components: this.components(eventId, staffLoc) }).catch(() => {});
  }

  /** Post the event message and store its id. */
  static async publish(guild: Guild, channel: TextChannel, event: ScheduledEvent): Promise<void> {
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const msg = await channel.send({ embeds: [this.buildEmbed(event, [], loc)], components: this.components(event.id, loc) }).catch(() => null);
    if (msg) await prisma.scheduledEvent.update({ where: { id: event.id }, data: { messageId: msg.id } });
  }

  /** Remind "going" RSVPs shortly before events start. Invoked each minute. */
  static async runReminders(client: BotClient): Promise<void> {
    const now = Date.now();
    const soon = new Date(now + 15 * 60 * 1000);
    const due = await prisma.scheduledEvent.findMany({ where: { reminderSent: false, cancelled: false, startsAt: { gt: new Date(now), lte: soon } } }).catch(() => []);
    for (const event of due) {
      await prisma.scheduledEvent.update({ where: { id: event.id }, data: { reminderSent: true } }).catch(swallow);
      const guild = client.guilds.cache.get(event.guildId);
      const channel = guild?.channels.cache.get(event.channelId) as TextChannel | undefined;
      if (!guild || !channel?.isTextBased()) continue;
      const going = await prisma.eventRsvp.findMany({ where: { eventId: event.id, status: 'going' } });
      if (going.length === 0) continue;
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
      const unix = Math.floor(event.startsAt.getTime() / 1000);
      await channel.send({
        content: going.map((r) => `<@${r.userId}>`).join(' '),
        embeds: [new EmbedBuilder().setColor(COLORS.WARNING).setTitle(t('events.reminderTitle', loc, { title: event.title })).setDescription(t('events.reminderDesc', loc, { time: `<t:${unix}:R>` }))],
        allowedMentions: { users: going.map((r) => r.userId).slice(0, 100) },
      }).catch(swallow);
    }
  }
}
