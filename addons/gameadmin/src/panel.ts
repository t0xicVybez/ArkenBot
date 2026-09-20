/**
 * The `/gameadmin panel` control panel: a persistent embed with buttons that run
 * RCON actions (some directly, some via a modal for input). Button customIds are
 * `ga:btn:<action>:<serverId>` (direct) and `ga:mod:<action>:<serverId>` (modal),
 * with modal submits keyed `ga:submit:<action>:<serverId>`.
 */
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { GAMES } from './games.js';
import type { SavedGameServer } from './types.js';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function buildControlPanel(server: SavedGameServer, t: Translate): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const def = GAMES[server.game];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t('gameadmin.panelTitle', { server: server.name }))
    .setDescription(t('gameadmin.panelDesc', { game: def?.label ?? server.game, host: `${server.host}:${server.port}` }));

  const id = server.id;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ga:btn:players:${id}`).setLabel(t('gameadmin.btnPlayers')).setEmoji('👥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ga:btn:save:${id}`).setLabel(t('gameadmin.btnSave')).setEmoji('💾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ga:mod:broadcast:${id}`).setLabel(t('gameadmin.btnBroadcast')).setEmoji('📢').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ga:mod:kick:${id}`).setLabel(t('gameadmin.btnKick')).setEmoji('👢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ga:mod:ban:${id}`).setLabel(t('gameadmin.btnBan')).setEmoji('🔨').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ga:btn:stop:${id}`).setLabel(t('gameadmin.btnStop')).setEmoji('⏹️').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row1, row2] };
}

/** Builds the modal for actions that need text input (broadcast/kick/ban). */
export function buildActionModal(action: 'broadcast' | 'kick' | 'ban', serverId: string, t: Translate): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`ga:submit:${action}:${serverId}`).setTitle(t(`gameadmin.modalTitle.${action}`));
  const rows: ActionRowBuilder<TextInputBuilder>[] = [];

  if (action === 'broadcast') {
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('message').setLabel(t('gameadmin.modalMessage')).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200),
    ));
  } else {
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('player').setLabel(t('gameadmin.modalPlayer')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60),
    ));
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel(t('gameadmin.modalReason')).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120),
    ));
  }
  modal.addComponents(...rows);
  return modal;
}
