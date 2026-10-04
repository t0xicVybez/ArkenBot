/**
 * Guarantees a `Guild` row exists before guild-scoped writes.
 *
 * The bot creates the row on `guildCreate`/startup (ensureGuildExists), but a
 * dashboard admin can hit a write endpoint for a freshly-added guild inside that
 * window — every guild-scoped upsert then FK-violates (`*_guildId_fkey`) and 500s.
 * This closes the gap on the API side: when the row is missing we fetch the guild's
 * real name/owner from Discord with the bot token and create it. Best-effort — it
 * never throws, so it can't turn a working request into a failed one.
 */
import axios from 'axios';
import { prisma } from '../database.js';

// Guild IDs confirmed present this process, to skip the existence query on the hot path.
const known = new Set<string>();

export async function ensureGuildRow(guildId: string): Promise<void> {
  if (known.has(guildId)) return;
  try {
    const existing = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } });
    if (existing) { known.add(guildId); return; }

    // Row missing — pull the authoritative name/owner from Discord (bot must be in the guild).
    const { data } = await axios.get<{ name: string; owner_id: string; icon: string | null }>(
      `https://discord.com/api/v10/guilds/${guildId}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }, timeout: 8000 },
    );

    await prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: {
        id: guildId,
        name: data.name,
        ownerId: data.owner_id,
        iconUrl: data.icon ? `https://cdn.discordapp.com/icons/${guildId}/${data.icon}.png` : null,
        settings: { create: {} },
      },
    });
    known.add(guildId);
  } catch {
    // Bot not in the guild, Discord hiccup, or a concurrent create won the race.
    // Leave `known` unset so a later request retries; never block the request.
  }
}
