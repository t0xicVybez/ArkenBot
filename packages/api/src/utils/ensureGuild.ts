/**
 * Makes sure a guild row exists before the API acts on it, fetching the guild's details from Discord when it's new.
 */
import axios from 'axios';
import { prisma } from '../database.js';

const known = new Set<string>();

/**
 * Returns true once a `guilds` row for this id exists (creating it from Discord
 * if it's new), or false if the row can't be established — which happens when
 * the bot isn't a member of the guild, so the Discord fetch fails. Callers use
 * the result to reject writes cleanly instead of letting a child-table upsert
 * blow up with a foreign-key violation.
 */
export async function ensureGuildRow(guildId: string): Promise<boolean> {
  if (known.has(guildId)) return true;
  try {
    const existing = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } });
    if (existing) { known.add(guildId); return true; }

    // Only succeeds when the bot is in the guild (it's the bot token).
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
    return true;
  } catch {
    // Bot not in the guild (or a transient Discord error): no row to write against.
    return false;
  }
}
