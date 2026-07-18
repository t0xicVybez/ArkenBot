/**
 * Game server query dispatcher.
 * Routes queries to the appropriate backend depending on the game type:
 * - Minecraft Java: SLP over TCP (minecraft-server-util), with a GameQuery fallback.
 * - Minecraft Bedrock: RakNet over UDP (minecraft-server-util).
 * - FiveM: HTTP REST API.
 * - Palworld: authenticated HTTP REST API — it answers no anonymous query protocol.
 * - Source/Valve games and everything else: A2S via GameQuery's `source` protocol.
 *
 * GameQuery (https://github.com/t0xicVybez/GameQuery) is our own dependency-free
 * query library; it replaced Gamedig here. Almost every dedicated server the bot
 * tracks answers Valve's A2S protocol, which GameQuery's `source` handler speaks;
 * a handful of games with bespoke query protocols that Gamedig covered but
 * GameQuery does not yet speak natively (Satisfactory, Eco, Starbound, Stationeers)
 * will report offline until a native GameQuery protocol is added for them.
 */
import { GameQuery, type Result } from '@t0xicvybez/gamequery';
import { status as mcJavaStatus, statusBedrock as mcBedrockStatus } from 'minecraft-server-util';
import type { QueryAuth, QueryResult, ServerStatus } from './types.js';

/** Metadata associated with each supported game type. */
export interface GameInfo {
  label: string;
  defaultPort: number;
  emoji: string;
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
  ark:                  { label: 'ARK: Survival Evolved',     defaultPort: 27015, emoji: '🦕' },
  asa:                  { label: 'ARK: Survival Ascended',    defaultPort: 27015, emoji: '🦕' },
  dayz:                 { label: 'DayZ',                      defaultPort: 27016, emoji: '🧟' },
  projectzomboid:       { label: 'Project Zomboid',           defaultPort: 16261, emoji: '🧟' },
  sevendaystodie:       { label: '7 Days to Die',             defaultPort: 26900, emoji: '🧟' },
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

/** Query timeout for GameQuery/A2S lookups, in milliseconds. */
const QUERY_TIMEOUT_MS = 8000;

/** Retry count passed to GameQuery (total attempts = retries + 1). */
const QUERY_RETRIES = 2;

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
    msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH') || msg.includes('Timed out') ||
    // GameQuery's UDP transport reports an unreachable/unresolvable host as "send failed".
    msg.includes('send failed')
  ) return 'Server did not respond (offline or unreachable)';
  if (msg.includes('ECONNREFUSED')) return 'Connection refused — is the query port open?';
  if (msg.includes('ENOTFOUND') || msg.includes('ENOENT')) return 'Host not found — check the address';
  return msg.split('\n')[0].slice(0, 200);
}

/**
 * Queries a Minecraft Java Edition server using the Server List Ping protocol.
 * Falls back to GameQuery's `minecraft` protocol when SLP fails (e.g. BungeeCord
 * or modded servers that respond differently).
 *
 * SRV lookups are skipped for raw IP addresses to avoid issues on some hosting providers.
 */
async function queryMinecraft(host: string, port: number): Promise<ServerStatus> {
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
    return queryGameQuery('minecraft', host, port);
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

/** Maps a GameQuery `source`/A2S result onto our own status shape. */
function toStatus(result: Result, host: string, port: number): QueryResult {
  const data = result.data;
  const rawList = Array.isArray(data.players_list)
    ? (data.players_list as Array<{ name?: unknown }>)
    : [];
  const playerList = rawList
    .map((p) => p.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '');

  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const str = (v: unknown): string => (typeof v === 'string' && v.trim() !== '' ? v : '');

  return {
    online: true,
    serverName: str(data.name) || host,
    map: str(data.map) || 'Unknown',
    players: typeof data.players === 'number' ? data.players : playerList.length,
    maxPlayers: num(data.max_players),
    playerList,
    bots: num(data.bots),
    ping: Math.round(result.pingMs),
    password: Boolean(data.password_protected),
    connect: `${host}:${port}`,
  };
}

/**
 * Queries a server through GameQuery and maps the result onto our status shape.
 * The `source` protocol covers Valve's A2S (nearly every dedicated server the bot
 * tracks); `minecraft` is used only as the Java SLP fallback.
 */
async function queryGameQuery(protocol: string, host: string, port: number): Promise<ServerStatus> {
  try {
    const results = await new GameQuery(QUERY_TIMEOUT_MS, QUERY_RETRIES)
      .addServer(protocol, `${host}:${port}`)
      .process();

    const result = results[0];
    if (!result || !result.online) {
      return { online: false, error: classifyError(result?.error ?? 'Server did not respond (offline or unreachable)') };
    }
    return toStatus(result, host, port);
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

  if (game === 'minecraft') return queryMinecraft(host, resolvedPort);
  if (game === 'minecraftbe') return queryMinecraftBedrock(host, resolvedPort);
  if (game === 'fivem') return queryFiveM(host, resolvedPort);

  // Everything else is Valve A2S, spoken by GameQuery's `source` protocol.
  return queryGameQuery('source', host, resolvedPort);
}
