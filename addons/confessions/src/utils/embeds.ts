import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ConfessionRecord } from '../types.js';

type T = (key: string, vars?: Record<string, string | number>) => string;

const COLOR = 0x8b5cf6; // violet

/** The public-facing anonymous post. Deliberately carries no author information. */
export function buildPublicEmbed(record: ConfessionRecord, t: T): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(t('publicTitle', { number: record.number }))
    .setDescription(record.content)
    .setFooter({ text: t('publicFooter') })
    .setTimestamp(new Date(record.createdAt));
}

/** Staff review card — also blind to the author (use /confess-setup whois for accountability). */
export function buildReviewEmbed(record: ConfessionRecord, t: T): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(t('reviewTitle', { number: record.number }))
    .setDescription(record.content)
    .setFooter({ text: t('reviewFooter') })
    .setTimestamp(new Date(record.createdAt));
}

export function buildReviewButtons(recordId: string, t: T): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`confess:approve:${recordId}`).setLabel(t('btnApprove')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`confess:deny:${recordId}`).setLabel(t('btnDeny')).setStyle(ButtonStyle.Danger),
  );
}
