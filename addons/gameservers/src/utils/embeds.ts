import { EmbedBuilder } from 'discord.js';
import type { ServerStatus, SavedServer } from '../types.js';
import { SUPPORTED_GAMES } from '../query.js';

export function buildStatusEmbed(
  status: ServerStatus,
  game: string,
  host: string,
  port?: number,
  savedName?: string,
): EmbedBuilder {
  const gameInfo = SUPPORTED_GAMES[game];
  const gameLabel = gameInfo?.label ?? game;
  const emoji = gameInfo?.emoji ?? '🎮';

  // Show the address players connect on, which for some games is not the port we
  // query (Killing Floor 2 answers A2S on 27015 but is joined on 7777). An
  // explicit port from the caller wins — we can't infer their game port.
  const queryPort = port ?? gameInfo?.defaultPort;
  const joinPort = port ?? gameInfo?.gamePort ?? gameInfo?.defaultPort;
  const address = status.online && status.connect ? status.connect : joinPort ? `${host}:${joinPort}` : host;
  // When the two differ, say which port was actually probed — it's the first
  // thing you want to know when a server reports offline.
  const queriedNote =
    queryPort && joinPort && queryPort !== joinPort ? `\n-# queried on \`${host}:${queryPort}\`` : '';

  if (!status.online) {
    return new EmbedBuilder()
      .setTitle(`${emoji} ${savedName ?? host}`)
      .setDescription(`\`${address}\`${queriedNote}\n\n❌ **Offline** — ${status.error}`)
      .setColor(0xed4245)
      .setFooter({ text: gameLabel })
      .setTimestamp();
  }

  const bar = playerBar(status.players, status.maxPlayers);
  const title = status.serverName !== host ? status.serverName : (savedName ?? host);

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x57f287)
    .setFooter({ text: `${gameLabel} • ${address}` })
    .setTimestamp()
    .addFields(
      {
        name: '📊 Players',
        value: `**${status.players}**/**${status.maxPlayers}**\n${bar}`,
        inline: true,
      },
      {
        name: '🗺️ Map',
        value: status.map || 'Unknown',
        inline: true,
      },
      {
        name: '📶 Ping',
        value: `${status.ping}ms${status.password ? '\n🔒 Password' : ''}${status.bots > 0 ? `\n🤖 ${status.bots} bots` : ''}`,
        inline: true,
      },
    );

  if (status.playerList.length > 0) {
    const shown = status.playerList.slice(0, 20);
    const overflow = status.playerList.length - shown.length;
    embed.addFields({
      name: `👥 Online Players`,
      value:
        shown.map((n) => `\`${n}\``).join(', ') +
        (overflow > 0 ? ` *+${overflow} more*` : ''),
    });
  }

  return embed;
}

export function buildServerListEmbed(servers: SavedServer[], guildName: string): EmbedBuilder {
  if (servers.length === 0) {
    return new EmbedBuilder()
      .setTitle('🎮 Saved Game Servers')
      .setDescription('No servers saved yet.\nUse `/server add` to save one for quick status checks.')
      .setColor(0x5865f2);
  }

  const lines = servers.map((s, i) => {
    const info = SUPPORTED_GAMES[s.game];
    const emoji = info?.emoji ?? '🎮';
    const addr = s.port ? `${s.host}:${s.port}` : s.host;
    return `${i + 1}. ${emoji} **${s.name}** — ${info?.label ?? s.game}\n   \`${addr}\``;
  });

  return new EmbedBuilder()
    .setTitle(`🎮 Saved Game Servers — ${guildName}`)
    .setDescription(lines.join('\n\n'))
    .setColor(0x5865f2)
    .setFooter({
      text: `${servers.length}/25 saved • Use /server check <name> to query`,
    });
}

export function buildCheckAllEmbed(
  results: { server: SavedServer; status: ServerStatus }[],
  guildName: string,
): EmbedBuilder {
  const online = results.filter((r) => r.status.online).length;
  const lines = results.map(({ server, status }) => {
    const info = SUPPORTED_GAMES[server.game];
    const emoji = info?.emoji ?? '🎮';
    if (!status.online) {
      return `${emoji} **${server.name}** — ❌ Offline`;
    }
    const s = status as import('../types.js').QueryResult;
    return `${emoji} **${server.name}** — ✅ \`${s.players}/${s.maxPlayers}\` · ${s.map} · ${s.ping}ms`;
  });

  return new EmbedBuilder()
    .setTitle(`🎮 Server Status — ${guildName}`)
    .setDescription(lines.join('\n'))
    .setColor(online === results.length ? 0x57f287 : online === 0 ? 0xed4245 : 0xfee75c)
    .setFooter({ text: `${online}/${results.length} online` })
    .setTimestamp();
}

function playerBar(current: number, max: number): string {
  if (max <= 0) return '';
  const pct = Math.min(current / max, 1);
  const filled = Math.round(pct * 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${Math.round(pct * 100)}%`;
}
