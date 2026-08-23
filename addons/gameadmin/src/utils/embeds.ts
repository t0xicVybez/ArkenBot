import { EmbedBuilder } from 'discord.js';
import { GAMES } from '../games.js';
import type { SavedGameServer } from '../types.js';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Result of a single RCON action. */
export function buildResultEmbed(server: SavedGameServer, title: string, output: string, t: Translate, isError = false): EmbedBuilder {
  const label = GAMES[server.game]?.label ?? server.game;
  const body = output && output.length ? output : t('gameadmin.noOutput');
  const embed = new EmbedBuilder()
    .setColor(isError ? 0xed4245 : 0x57f287)
    .setTitle(title)
    .setDescription('```\n' + body.slice(0, 1900) + '\n```')
    .setFooter({ text: `${label} • ${server.host}:${server.port}` })
    .setTimestamp();
  return embed;
}

/** The configured-servers list for `/gameadmin list`. */
export function buildServerListEmbed(servers: SavedGameServer[], t: Translate): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(t('gameadmin.listTitle'));
  if (!servers.length) {
    embed.setDescription(t('gameadmin.listEmpty'));
    return embed;
  }
  embed.setDescription(
    servers
      .map((s) => `**${s.name}** — ${GAMES[s.game]?.label ?? s.game} · \`${s.host}:${s.port}\``)
      .join('\n'),
  );
  return embed;
}
