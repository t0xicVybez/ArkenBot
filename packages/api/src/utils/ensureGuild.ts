
import axios from 'axios';
import { prisma } from '../database.js';

const known = new Set<string>();

export async function ensureGuildRow(guildId: string): Promise<void> {
  if (known.has(guildId)) return;
  try {
    const existing = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } });
    if (existing) { known.add(guildId); return; }

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

  }
}
