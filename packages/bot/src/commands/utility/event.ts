/** /event create|list|cancel — schedule events with RSVP buttons. */
import {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags,
  type ChatInputCommandInteraction, type TextChannel,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS, parseDuration } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EventsModule } from '../../modules/events/EventsModule.js';

/** Resolve a "when" string to a future Date: relative duration (2d/3h) or an absolute date. */
function resolveWhen(raw: string): Date | null {
  const dur = parseDuration(raw);
  if (dur && dur > 0) return new Date(Date.now() + dur * 1000);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed) && parsed > Date.now()) return new Date(parsed);
  return null;
}

const command: BotCommand = {
  category: 'Utility',
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Schedule events with RSVPs')
    .addSubcommand((s) => s.setName('create').setDescription('Create a scheduled event')
      .addStringOption((o) => o.setName('title').setDescription('Event title').setRequired(true))
      .addStringOption((o) => o.setName('when').setDescription('When: e.g. "2d", "6h", or "2026-09-01 18:00"').setRequired(true))
      .addStringOption((o) => o.setName('description').setDescription('Details').setRequired(false))
      .addStringOption((o) => o.setName('location').setDescription('Where (voice channel, place, link…)').setRequired(false))
      .addRoleOption((o) => o.setName('role').setDescription('Role granted to members who RSVP "Going"').setRequired(false))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in (default: here)').setRequired(false)))
    .addSubcommand((s) => s.setName('list').setDescription('List upcoming events'))
    .addSubcommand((s) => s.setName('cancel').setDescription('Cancel an upcoming event')
      .addStringOption((o) => o.setName('id').setDescription('Event ID (from /event list)').setRequired(true))) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) { await interaction.reply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))], flags: MessageFlags.Ephemeral }); return; }
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const events = await prisma.scheduledEvent.findMany({ where: { guildId: interaction.guild.id, cancelled: false, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, take: 15 });
      if (events.length === 0) { await interaction.reply({ embeds: [errorEmbed(t('events.listTitle', loc), t('events.listEmpty', loc))], flags: MessageFlags.Ephemeral }); return; }
      const lines = events.map((e) => `• **${e.title}** — <t:${Math.floor(e.startsAt.getTime() / 1000)}:R>  ·  \`${e.id}\``);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.INFO).setTitle(t('events.listTitle', loc)).setDescription(lines.join('\n'))], flags: MessageFlags.Ephemeral });
      return;
    }

    // create & cancel require Manage Events / Manage Guild.
    const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!canManage) { await interaction.reply({ content: t('events.needManage', loc), flags: MessageFlags.Ephemeral }); return; }

    if (sub === 'cancel') {
      const id = interaction.options.getString('id', true);
      const event = await prisma.scheduledEvent.findFirst({ where: { id, guildId: interaction.guild.id } });
      if (!event) { await interaction.reply({ content: t('events.gone', loc), flags: MessageFlags.Ephemeral }); return; }
      await prisma.scheduledEvent.update({ where: { id }, data: { cancelled: true } });
      // Best-effort: strike through the original message.
      const channel = interaction.guild.channels.cache.get(event.channelId) as TextChannel | undefined;
      if (channel && event.messageId) {
        const rsvps = await prisma.eventRsvp.findMany({ where: { eventId: id } });
        const msg = await channel.messages.fetch(event.messageId).catch(() => null);
        await msg?.edit({ embeds: [EventsModule.buildEmbed({ ...event, cancelled: true }, rsvps, loc)], components: EventsModule.components(id, loc, true) }).catch(() => {});
      }
      await interaction.reply({ content: t('events.cancelled', loc, { title: event.title }), flags: MessageFlags.Ephemeral });
      return;
    }

    // create
    const title = interaction.options.getString('title', true).slice(0, 200);
    const when = resolveWhen(interaction.options.getString('when', true));
    if (!when) { await interaction.reply({ embeds: [errorEmbed(t('events.badWhenTitle', loc), t('events.badWhen', loc))], flags: MessageFlags.Ephemeral }); return; }
    const description = interaction.options.getString('description')?.slice(0, 1500) ?? null;
    const location = interaction.options.getString('location')?.slice(0, 200) ?? null;
    const role = interaction.options.getRole('role');
    const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
    if (!channel?.isTextBased()) { await interaction.reply({ content: t('events.badChannel', loc), flags: MessageFlags.Ephemeral }); return; }

    const event = await prisma.scheduledEvent.create({
      data: { guildId: interaction.guild.id, channelId: channel.id, title, description, location, startsAt: when, creatorId: interaction.user.id, roleId: role?.id ?? null },
    });
    await EventsModule.publish(interaction.guild, channel, event);
    await interaction.reply({ content: t('events.created', loc, { channel: `<#${channel.id}>` }), flags: MessageFlags.Ephemeral });
  },
};

export default command;
