/**
 * Game server query dispatcher.
 * Routes queries to the appropriate backend depending on the game type:
 * - Minecraft Java: SLP over TCP (minecraft-server-util), with a Gamedig fallback.
 * - Minecraft Bedrock: RakNet over UDP.
 * - FiveM: HTTP REST API.
 * - Palworld: authenticated HTTP REST API — it answers no anonymous query protocol.
 * - Source/Valve games: A2S queries via Gamedig.
 * - All others: Gamedig generic query.
 */
import Gamedig from 'gamedig';
import type { QueryResult as GamedigResult } from 'gamedig';
import { status as mcJavaStatus, statusBedrock as mcBedrockStatus } from 'minecraft-server-util';
import type { QueryAuth, QueryResult, ServerStatus } from './types.js';

/** Metadata associated with each supported game type. */
export interface GameInfo {
  label: string;
  defaultPort: number;
  emoji: string;
  /**
   * Gamedig type to query with, when it differs from our registry key.
   * Our keys are persisted on saved servers, so they must stay stable even when
   * Gamedig names the same game differently. `protocol-valve` drives Gamedig's
   * A2S implementation directly, for Steam games it has no registry entry for.
   */
  gamedigType?: string;
}

/** The UDP port Palworld players connect on (`PublicPort`). */
const PALWORLD_GAME_PORT = 8211;

/** Default port of Palworld's REST API (`RESTAPIPort`). */
export const PALWORLD_REST_PORT = 8212;

/** Games with no anonymous query protocol — they need an admin password to check. */
export const AUTHENTICATED_GAMES = new Set(['palworld']);

/** Raised when a game's status API rejects the stored credential. */
class UnauthorizedError extends Error {}

/** Registry of supported game types keyed by our own stable identifier. */
export const SUPPORTED_GAMES: Record<string, GameInfo> = {
  // ── Sandbox / Survival ──────────────────────────────────────────────────────
  minecraft:            { label: 'Minecraft Java Edition',    defaultPort: 25565, emoji: '⛏️' },
  minecraftbe:          { label: 'Minecraft Bedrock',         defaultPort: 19132, emoji: '⛏️' },
  rust:                 { label: 'Rust',                      defaultPort: 28015, emoji: '🔧' },
  valheim:              { label: 'Valheim',                   defaultPort: 2457,  emoji: '⚔️' },
  ark:                  { label: 'ARK: Survival Evolved',     defaultPort: 27015, emoji: '🦕', gamedigType: 'arkse' },
  asa:                  { label: 'ARK: Survival Ascended',    defaultPort: 27015, emoji: '🦕' },
  dayz:                 { label: 'DayZ',                      defaultPort: 27016, emoji: '🧟' },
  projectzomboid:       { label: 'Project Zomboid',           defaultPort: 16261, emoji: '🧟', gamedigType: 'przomboid' },
  sevendaystodie:       { label: '7 Days to Die',             defaultPort: 26900, emoji: '🧟', gamedigType: '7d2d' },
  conanexiles:          { label: 'Conan Exiles',              defaultPort: 7777,  emoji: '⚔️' },
  vrising:              { label: 'V Rising',                  defaultPort: 9876,  emoji: '🧛' },
  palworld:             { label: 'Palworld',                  defaultPort: PALWORLD_GAME_PORT, emoji: '🌿' },
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
  l4d2:                 { label: 'Left 4 Dead 2',             defaultPort: 27015, emoji: '🧟', gamedigType: 'left4dead2' },
  unturned:             { label: 'Unturned',                  defaultPort: 27015, emoji: '🧟' },

  // ── Competitive / FPS ───────────────────────────────────────────────────────
  csgo:                 { label: 'CS:GO / CS2',               defaultPort: 27015, emoji: '🎯' },
  tf2:                  { label: 'Team Fortress 2',           defaultPort: 27015, emoji: '🔫' },
  gmod:                 { label: "Garry's Mod",               defaultPort: 27015, emoji: '🔧', gamedigType: 'garrysmod' },
  blackmesa:            { label: 'Black Mesa',                defaultPort: 27015, emoji: '🔬' },
  insurgencysandstorm:  { label: 'Insurgency: Sandstorm',     defaultPort: 27131, emoji: '💣' },
  squad:                { label: 'Squad',                     defaultPort: 27165, emoji: '🪖' },
  postscriptum:         { label: 'Post Scriptum',             defaultPort: 10037, emoji: '🪖', gamedigType: 'ps' },
  hellletloose:         { label: 'Hell Let Loose',            defaultPort: 26420, emoji: '🪖', gamedigType: 'hll' },
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
  'sevendaystodie', 'insurgencysandstorm', 'squad', 'conanexiles', 'vrising',
  'barotrauma', 'mordhau', 'wreckfest', 'blackmesa', 'postscriptum', 'hellletloose',
  'groundbranch', 'hurtworld', 'miscreated', 'unturned', 'spaceengineers', 'scum',
  'valheim', 'projectzomboid', 'pavlovvr', 'theforest', 'avorion', 'empyrion',
]);

/**
 * Resolves one of our registry keys to the type Gamedig expects.
 * Saved servers persist our key, so the two are deliberately decoupled.
 */
function gamedigTypeFor(game: string): string {
  return SUPPORTED_GAMES[game]?.gamedigType ?? game;
}

/**
 * Translates common network error messages into user-readable strings.
 * Raw error messages can contain internal library details that are not useful to end users.
 */
function classifyError(err: unknown): string {
  // Node's fetch reports every network failure as a bare "fetch failed" TypeError
  // and hides the real errno on `cause`, so fold that in before matching.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  const msg = `${err instanceof Error ? err.message : String(err)} ${cause}`.trim();

  if (
    msg.includes('Failed after') || msg.includes('Failed all') ||
    msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('timeout') ||
    msg.includes('EHOSTUNREACH') || msg.includes('Timed out')
  ) return 'Server did not respond (offline or unreachable)';
  if (msg.includes('ECONNREFUSED')) return 'Connection refused — is the query port open?';
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

/** Maps a raw Gamedig result onto our own status shape. */
function toStatus(result: GamedigResult, host: string): QueryResult {
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
}

/** Queries a Valve/Source game server using the A2S protocol via Gamedig. */
async function queryValve(type: string, host: string, port: number, givenPortOnly: boolean): Promise<ServerStatus> {
  try {
    const result = await Gamedig.query({
      type,
      host,
      port,
      maxRetries: 3,
      socketTimeout: 8000,
      givenPortOnly,
    });
    return toStatus(result, host);
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

/**
 * Queries a Palworld server through its REST API.
 *
 * Palworld exposes no anonymous status protocol — its dedicated servers do not
 * answer Steam A2S on any port — so the authenticated REST API is the only way to
 * read live status. The server must set `RESTAPIEnabled=True` in
 * PalWorldSettings.ini, and we need its `AdminPassword`.
 *
 * `auth.queryPort` is the REST port (`RESTAPIPort`, default 8212), which is
 * separate from the game port players connect on.
 */
async function queryPalworld(host: string, gamePort: number, auth: QueryAuth): Promise<ServerStatus> {
  const restPort = auth.queryPort ?? PALWORLD_REST_PORT;
  const base = `http://${host}:${restPort}/v1/api`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`admin:${auth.password}`).toString('base64')}`,
  };

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  };

  try {
    const start = Date.now();
    const [info, metrics, roster] = await Promise.all([
      get<{ servername?: string; version?: string }>('/info'),
      get<{ currentplayernum?: number; maxplayernum?: number }>('/metrics'),
      get<{ players?: { name?: string }[] }>('/players'),
    ]);
    const ping = Date.now() - start;

    const playerList = (roster.players ?? [])
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');

    return {
      online: true,
      serverName: info.servername || host,
      map: info.version ? `Palworld ${info.version}` : 'Palworld',
      players: metrics.currentplayernum ?? playerList.length,
      maxPlayers: metrics.maxplayernum ?? 32,
      playerList,
      bots: 0,
      ping,
      password: false,
      connect: `${host}:${gamePort}`,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { online: false, error: 'Admin password rejected — re-add the server with the correct password.' };
    }
    return { online: false, error: classifyError(err) };
  }
}

/** Queries any game supported by Gamedig that doesn't have a more specific handler. */
async function queryGamedig(type: string, host: string, port: number, givenPortOnly: boolean): Promise<ServerStatus> {
  try {
    const result = await Gamedig.query({
      type,
      host,
      port,
      maxRetries: 3,
      socketTimeout: 10000,
      givenPortOnly,
    });
    return toStatus(result, host);
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
  auth?: QueryAuth,
): Promise<ServerStatus> {
  const gameInfo = SUPPORTED_GAMES[game];
  const resolvedPort = port ?? gameInfo?.defaultPort ?? 27015;
  const givenPortOnly = port !== undefined;

  if (game === 'palworld') {
    if (!auth) {
      return {
        online: false,
        error:
          'Palworld needs an admin password to query — it has no public status protocol. ' +
          'Enable `RESTAPIEnabled=True` in PalWorldSettings.ini and re-add the server.',
      };
    }
    return queryPalworld(host, resolvedPort, auth);
  }

  if (game === 'minecraft') return queryMinecraft(host, resolvedPort, givenPortOnly);
  if (game === 'minecraftbe') return queryMinecraftBedrock(host, resolvedPort);
  if (game === 'fivem') return queryFiveM(host, resolvedPort);

  const type = gamedigTypeFor(game);
  if (VALVE_GAMES.has(game)) return queryValve(type, host, resolvedPort, givenPortOnly);
  return queryGamedig(type, host, resolvedPort, givenPortOnly);
}
