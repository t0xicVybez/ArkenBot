/**
 * Handles the private RCON-password modal that finishes a `/gameadmin add`.
 */
import { MessageFlags, type Interaction } from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { encryptCredential } from '../crypto.js';
import { saveServer, takePending, newServerId } from '../storage.js';
import { GAMES } from '../games.js';

export const interactionHandler = {
  async handle(ctx: AddonContext, interaction: Interaction): Promise<void> {
    if (!interaction.isModalSubmit() || interaction.customId !== 'gameadmin:add:pw' || !interaction.guildId) return;
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
  },
};
