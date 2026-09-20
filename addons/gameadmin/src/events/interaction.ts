/**
 * Handles gameadmin interactions:
 *  - `gameadmin:add:pw`     — the private RCON-password modal finishing `/gameadmin add`
 *  - `ga:btn:<a>:<id>`      — control-panel buttons that run an action directly
 *  - `ga:mod:<a>:<id>`      — control-panel buttons that open an input modal
 *  - `ga:submit:<a>:<id>`   — those modals coming back
 * All panel actions are Manage-Server gated and audit-logged.
 */
import {
  MessageFlags, PermissionFlagsBits,
  type Interaction, type ButtonInteraction, type ModalSubmitInteraction,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { encryptCredential } from '../crypto.js';
import { saveServer, takePending, newServerId, findServer } from '../storage.js';
import { GAMES } from '../games.js';
import { buildResultEmbed } from '../utils/embeds.js';
import { buildActionCommand, runServerCommand, postAudit, resolvePlayerTarget, type RconAction } from '../admin.js';
import { buildActionModal } from '../panel.js';
import { RconError } from '../rcon/source.js';
import type { SavedGameServer } from '../types.js';

export const interactionHandler = {
  async handle(ctx: AddonContext, interaction: Interaction): Promise<void> {
    if (interaction.isButton() && interaction.customId.startsWith('ga:')) {
      await handlePanelButton(ctx, interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ga:submit:')) {
      await handlePanelModal(ctx, interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'gameadmin:add:pw') {
      await handleAddPassword(ctx, interaction);
    }
  },
};

function isAdmin(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Runs an RCON action, replies with the result, and writes an audit entry. */
async function runAndReply(
  ctx: AddonContext,
  interaction: ButtonInteraction | ModalSubmitInteraction,
  server: SavedGameServer,
  action: RconAction,
  args: { message?: string; player?: string; reason?: string },
): Promise<void> {
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (args.player) args = { ...args, player: await resolvePlayerTarget(server, args.player) };
  const raw = buildActionCommand(server, action, args);
  if (raw === null) {
    await interaction.reply({ content: t('gameadmin.notSupported', { action, game: GAMES[server.game]?.label ?? server.game }), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const title = t(`gameadmin.titles.${action}`, { server: server.name });
  const detail = args.player ? `${action} ${args.player}${args.reason ? ` (${args.reason})` : ''}` : (args.message ?? action);
  try {
    const output = await runServerCommand(server, raw);
    await interaction.editReply({ embeds: [buildResultEmbed(server, title, output, t)] });
    if (interaction.guild) await postAudit(ctx, interaction.guild, { userId: interaction.user.id, server, action: detail, ok: true });
  } catch (err) {
    const msg = err instanceof RconError ? err.message : (err as Error).message;
    await interaction.editReply({ embeds: [buildResultEmbed(server, t('gameadmin.errorTitle'), msg, t, true)] });
    if (interaction.guild) await postAudit(ctx, interaction.guild, { userId: interaction.user.id, server, action: detail, detail: msg, ok: false });
  }
}

async function handlePanelButton(ctx: AddonContext, interaction: ButtonInteraction): Promise<void> {
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!isAdmin(interaction) || !interaction.guildId) {
    await interaction.reply({ content: t('gameadmin.panelNoPerms'), flags: MessageFlags.Ephemeral });
    return;
  }
  const [, kind, action, serverId] = interaction.customId.split(':');
  const server = await findServer(ctx.storage, interaction.guildId, serverId);
  if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }

  if (kind === 'mod') {
    await interaction.showModal(buildActionModal(action as 'broadcast' | 'kick' | 'ban', serverId, t));
    return;
  }
  // direct buttons: players / save / stop
  await runAndReply(ctx, interaction, server, action as RconAction, {});
}

async function handlePanelModal(ctx: AddonContext, interaction: ModalSubmitInteraction): Promise<void> {
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!isAdmin(interaction) || !interaction.guildId) {
    await interaction.reply({ content: t('gameadmin.panelNoPerms'), flags: MessageFlags.Ephemeral });
    return;
  }
  const [, , modalAction, serverId] = interaction.customId.split(':');
  const server = await findServer(ctx.storage, interaction.guildId, serverId);
  if (!server) { await interaction.reply({ content: t('gameadmin.notFound'), flags: MessageFlags.Ephemeral }); return; }

  if (modalAction === 'broadcast') {
    await runAndReply(ctx, interaction, server, 'say', { message: interaction.fields.getTextInputValue('message').trim() });
  } else {
    await runAndReply(ctx, interaction, server, modalAction as RconAction, {
      player: interaction.fields.getTextInputValue('player').trim(),
      reason: interaction.fields.getTextInputValue('reason').trim() || undefined,
    });
  }
}

async function handleAddPassword(ctx: AddonContext, interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const pending = await takePending(ctx.storage, interaction.guildId, interaction.user.id);
  if (!pending) { await interaction.reply({ content: t('gameadmin.pendingLost'), flags: MessageFlags.Ephemeral }); return; }

  const password = interaction.fields.getTextInputValue('password');
  await saveServer(ctx.storage, interaction.guildId, {
    id: newServerId(),
    name: pending.name,
    game: pending.game,
    host: pending.host,
    port: pending.port,
    password: encryptCredential(password),
  });

  await interaction.reply({
    content: t('gameadmin.added', { name: pending.name, game: GAMES[pending.game]?.label ?? pending.game, host: pending.host, port: pending.port }),
    flags: MessageFlags.Ephemeral,
  });
}
