/**
 * Game server query dispatcher.
 * Routes queries to the appropriate backend depending on the game type:
 * - Minecraft Java: SLP over TCP (minecraft-server-util), with a Gamedig fallback.
 * - Minecraft Bedrock: RakNet over UDP.
 * - FiveM: HTTP REST API.
 * - Source/Valve games: A2S queries via Gamedig.
 * - All others: Gamedig generic query.
 */
import Gamedig from 'gamedig';
import { status as mcJavaStatus, statusBedrock as mcBedrockStatus } from 'minecraft-server-util';
import type { ServerStatus } from './types.js';

/** Metadata associated with each supported game type. */
export interface GameInfo {
  label: string;
  defaultPort: number;
  emoji: string;
}

/** Registry of supported game types keyed by Gamedig type identifier. */
export const SUPPORTED_GAMES: Record<string, GameInfo> = {
  // ── Sandbox / Survival ──────────────────────────────────────────────────────
  minecraft:            { label: 'Minecraft Java Edition',    defaultPort: 25565, emoji: '⛏️' },
  minecraftbe:          { label: 'Minecraft Bedrock',         defaultPort: 19132, emoji: '⛏️' },
  rust:                 { label: 'Rust',                      defaultPort: 28015, emoji: '🔧' },
  valheim:              { label: 'Valheim',                   defaultPort: 2457,  emoji: '⚔️' },
  ark:                  { label: 'ARK: Survival Evolved',     defaultPort: 27015, emoji: '🦕' },
  asa:                  { label: 'ARK: Survival Ascended',    defaultPort: 27015, emoji: '🦕' },
  dayz:                 { label: 'DayZ',                      defaultPort: 27016, emoji: '🧟' },
  projectzomboid:       { label: 'Project Zomboid',           defaultPort: 16261, emoji: '🧟' },
  sevendaystodie:       { label: '7 Days to Die',             defaultPort: 26900, emoji: '🧟' },
  conanexiles:          { label: 'Conan Exiles',              defaultPort: 7777,  emoji: '⚔️' },
  vrising:              { label: 'V Rising',                  defaultPort: 9876,  emoji: '🧛' },
  palworld:             { label: 'Palworld',                  defaultPort: 8211,  emoji: '🌿' },
  scum:                 { label: 'SCUM',                      defaultPort: 7042,  emoji: '🏝️' },
  hurtworld:            { label: 'Hurtworld',                 defaultPort: 12871, emoji: '🌵' },
  miscreated:           { label: 'Miscreated',                defaultPort: 64090, emoji: '🌲' },
  theforest:            { label: 'The Forest',                defaultPort: 27016, emoji: '🌲' },
  eco:                  { label: 'Eco',                       defaultPort: 3000,  emoji: '🌍' },
  empyrion:             { label: 'Empyrion',                  defaultPort: 30000, emoji: '🚀' },
  avorion:              { label: 'Avorion',                   defaultPort: 27000, emoji: '🚀' },
  spaceengineers:       { label: 'Space Engineers',           defaultPort: 27016, emoji: '🚀' },
  stationeers:          { label: 'Stationeers',               defaultPort: 27500, emoji: '🛸' },

  // ── Co-op ───────────────────────────────────────────────────────────────────
  terraria:             { label: 'Terraria',                  defaultPort: 7777,  emoji: '🌳' },
  starbound:            { label: 'Starbound',                 defaultPort: 21025, emoji: '⭐' },
  satisfactory:         { label: 'Satisfactory',              defaultPort: 15777, emoji: '🏭' },
  barotrauma:           { label: 'Barotrauma',                defaultPort: 27015, emoji: '🌊' },
  killingfloor2:        { label: 'Killing Floor 2',           defaultPort: 7777,  emoji: '🔪' },
  l4d2:                 { label: 'Left 4 Dead 2',             defaultPort: 27015, emoji: '🧟' },
  unturned:             { label: 'Unturned',                  defaultPort: 27015, emoji: '🧟' },

  // ── Competitive / FPS ───────────────────────────────────────────────────────
  csgo:                 { label: 'CS:GO / CS2',               defaultPort: 27015, emoji: '🎯' },
  tf2:                  { label: 'Team Fortress 2',           defaultPort: 27015, emoji: '🔫' },
  gmod:                 { label: "Garry's Mod",               defaultPort: 27015, emoji: '🔧' },
  blackmesa:            { label: 'Black Mesa',                defaultPort: 27015, emoji: '🔬' },
  insurgencysandstorm:  { label: 'Insurgency: Sandstorm',     defaultPort: 27131, emoji: '💣' },
  squad:                { label: 'Squad',                     defaultPort: 27165, emoji: '🪖' },
  postscriptum:         { label: 'Post Scriptum',             defaultPort: 10037, emoji: '🪖' },
  hellletloose:         { label: 'Hell Let Loose',            defaultPort: 26420, emoji: '🪖' },
  mordhau:              { label: 'Mordhau',                   defaultPort: 7777,  emoji: '⚔️' },
  groundbranch:         { label: 'Ground Branch',             defaultPort: 27015, emoji: '🔫' },
  pavlovvr:             { label: 'Pavlov VR',                 defaultPort: 7777,  emoji: '🎮' },
  wreckfest:            { label: 'Wreckfest',                 defaultPort: 27015, emoji: '🏎️' },

  // ── Mil-Sim / Open World ────────────────────────────────────────────────────
  arma3:                { label: 'Arma 3',                    defaultPort: 2302,  emoji: '🪖' },
  fivem:                { label: 'FiveM (GTA V)',             defaultPort: 30120, emoji: '🚗' },
};

/**
 * Games that use Valve's A2S protocol and are queried via Gamedig's Source engine handler.
 * FiveM and both Minecraft variants are excluded and handled by dedicated functions.
 */
const VALVE_GAMES = new Set([
  'rust', 'csgo', 'tf2', 'gmod', 'ark', 'asa', 'dayz', 'l4d2', 'killingfloor2',
  'sevendaystodie', 'insurgencysandstorm', 'squad', 'conanexiles', 'vrising', 'palworld',
  'barotrauma', 'mordhau', 'wreckfest', 'blackmesa', 'postscriptum', 'hellletloose',
  'groundbranch', 'hurtworld', 'miscreated', 'unturned', 'spaceengineers', 'scum',
  'valheim', 'projectzomboid', 'pavlovvr', 'theforest', 'avorion', 'empyrion',
]);

/**
 * Translates common network error messages into user-readable strings.
 * Raw error messages can contain internal library details that are not useful to end users.
 */
function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('Failed after') || msg.includes('Failed all') ||
    msg.includes('timed out') || msg.includes('ETIMEDOUT') ||
    msg.includes('EHOSTUNREACH') || msg.includes('Timed out')
  ) return 'Server did not respond (offline or unreachable)';
  if (msg.includes('ECONNREFUSED')) return 'Connection refused — check the port';
  if (msg.includes('ENOTFOUND') || msg.includes('ENOENT')) return 'Host not found — check the address';
  return msg.split('\n')[0].slice(0, 200);
}

/**
 * Queries a Minecraft Java Edition server using the Server List Ping protocol.
 * Falls back to Gamedig when SLP fails (e.g. BungeeCord or modded servers that
 * respond differently).
 *
 * SRV lookups are skipped for raw IP addresses to avoid issues on some hosting providers.
 */
async function queryMinecraft(host: string, port: number, givenPortOnly: boolean): Promise<ServerStatus> {
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  try {
    const result = await mcJavaStatus(host, port, { timeout: 8000, enableSRV: !isIp });
    const playerList = (result.players.sample ?? [])
      .map((p: { name: string }) => p.name)
      .filter(Boolean);
    return {
      online: true,
      serverName: result.motd.clean || host,
      map: `Java ${result.version.name}`,
      players: result.players.online,
      maxPlayers: result.players.max,
      playerList,
      bots: 0,
      ping: result.roundTripLatency,
      password: false,
      connect: port === 25565 ? host : `${host}:${port}`,
    };
  } catch {
    return queryGamedig('minecraft', host, port, givenPortOnly);
  }
}

/** Queries a Minecraft Bedrock Edition server over RakNet/UDP. */
async function queryMinecraftBedrock(host: string, port: number): Promise<ServerStatus> {
  try {
    const result = await mcBedrockStatus(host, port, { timeout: 8000 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    return {
      online: true,
      serverName: result.motd.clean || host,
      map: r.levelName ?? r.worldName ?? `Bedrock ${result.version.name}`,
      players: result.players.online,
      maxPlayers: result.players.max,
      playerList: [],
      bots: 0,
      ping: r.roundTripLatency ?? r.latency ?? 0,
      password: false,
      connect: port === 19132 ? host : `${host}:${port}`,
    };
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

/** Queries a FiveM server using its public HTTP REST endpoints (`/info.json`, `/players.json`). */
async function queryFiveM(host: string, port: number): Promise<ServerStatus> {
  try {
    const base = `http://${host}:${port}`;
    const start = Date.now();
    const [infoRes, playersRes] = await Promise.all([
      fetch(`${base}/info.json`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/players.json`, { signal: AbortSignal.timeout(8000) }),
    ]);
    const ping = Date.now() - start;

    if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);

    const info = await infoRes.json() as {
      hostname?: string; mapname?: string; clients?: number; sv_maxclients?: number;
    };
    const players = playersRes.ok
      ? (await playersRes.json() as { name: string }[])
      : [];

    return {
      online: true,
      serverName: info.hostname ?? host,
      map: info.mapname ?? 'Unknown',
      players: players.length,
      maxPlayers: info.sv_maxclients ?? 32,
      playerList: players.map((p) => p.name).filter(Boolean),
      bots: 0,
      ping,
      password: false,
      connect: `${host}:${port}`,
    };
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

/** Queries a Valve/Source game server using the A2S protocol via Gamedig. */
async function queryValve(game: string, host: string, port: number, givenPortOnly: boolean): Promise<ServerStatus> {
  try {
    const result = await Gamedig.query({
      type: game,
      host,
      port,
      maxRetries: 3,
      socketTimeout: 8000,
      givenPortOnly,
    });
    const playerList = result.players
      .map((p: { name?: string }) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
    return {
      online: true,
      serverName: result.name ?? host,
      map: result.map ?? 'Unknown',
      players: result.players.length,
      maxPlayers: result.maxplayers,
      playerList,
      bots: result.bots.length,
      ping: Math.round(result.ping),
      password: result.password,
      connect: result.connect,
    };
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

/** Queries any game supported by Gamedig that doesn't have a more specific handler. */
async function queryGamedig(game: string, host: string, port: number, givenPortOnly: boolean): Promise<ServerStatus> {
  try {
    const result = await Gamedig.query({
      type: game,
      host,
      port,
      maxRetries: 3,
      socketTimeout: 10000,
      givenPortOnly,
    });
    const playerList = result.players
      .map((p: { name?: string }) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
    return {
      online: true,
      serverName: result.name ?? host,
      map: result.map ?? 'Unknown',
      players: result.players.length,
      maxPlayers: result.maxplayers,
      playerList,
      bots: result.bots.length,
      ping: Math.round(result.ping),
      password: result.password,
      connect: result.connect,
    };
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

/**
 * Queries a game server and returns its status.
 * Selects the appropriate query method based on the `game` identifier.
 *
 * @param game - A key from `SUPPORTED_GAMES` identifying the game type.
 * @param host - The server's IP address or hostname.
 * @param port - Optional port; falls back to the game's default port when omitted.
 */
export async function queryServer(
  game: string,
  host: string,
  port?: number,
): Promise<ServerStatus> {
  const gameInfo = SUPPORTED_GAMES[game];
  const resolvedPort = port ?? gameInfo?.defaultPort ?? 27015;
  const givenPortOnly = port !== undefined;

  if (game === 'minecraft') return queryMinecraft(host, resolvedPort, givenPortOnly);
  if (game === 'minecraftbe') return queryMinecraftBedrock(host, resolvedPort);
  if (game === 'fivem') return queryFiveM(host, resolvedPort);
  if (VALVE_GAMES.has(game)) return queryValve(game, host, resolvedPort, givenPortOnly);
  return queryGamedig(game, host, resolvedPort, givenPortOnly);
}
