/**
 * Game server query dispatcher.
 *
 * Almost everything is delegated to GameQuery (our own dependency-free query
 * library, https://github.com/t0xicVybez/GameQuery): each supported game maps to
 * a GameQuery protocol (`source`/A2S for most dedicated servers, plus native
 * `bedrock`, `fivem`, `satisfactory`, …). Two games keep a bespoke handler here:
 * - Minecraft Java: SLP via minecraft-server-util for its SRV-record support,
 *   falling back to GameQuery's `minecraft` protocol.
 * - Palworld: authenticated REST (admin password + the /metrics max-players
 *   endpoint that GameQuery's lightweight `palworld` handler doesn't fetch).
 */
import { GameQuery, type Result } from '@t0xicvybez/gamequery';
import { status as mcJavaStatus } from 'minecraft-server-util';
import type { QueryAuth, QueryResult, ServerStatus } from './types.js';

/** Metadata associated with each supported game type. */
export interface GameInfo {
  label: string;
  defaultPort: number;
  emoji: string;
  /** The GameQuery protocol used to query this game. */
  protocol: string;
}

/** The UDP port Palworld players connect on (`PublicPort`). */
const PALWORLD_GAME_PORT = 8211;

/** Default port of Palworld's REST API (`RESTAPIPort`). */
export const PALWORLD_REST_PORT = 8212;

/**
 * Games with no anonymous query protocol — they need a stored secret to check.
 * Palworld's REST API requires the admin password (collected through the
 * credential flow and stored encrypted). Terraria's TShock status endpoint is
 * public, so it is queried anonymously and is not listed here.
 */
export const AUTHENTICATED_GAMES = new Set(['palworld']);

/** Raised when a game's status API rejects the stored credential. */
class UnauthorizedError extends Error {}

/**
 * Registry of supported game types keyed by our own stable identifier.
 *
 * Every entry maps to a GameQuery protocol that can *actually* read the server
 * (A2S/`source` for Steam dedicated servers, plus GameQuery's native handlers).
 * Games with no working query protocol are deliberately absent — listing them
 * would only let users add servers that always report offline.
 */
export const SUPPORTED_GAMES: Record<string, GameInfo> = {
  // ── Sandbox / Survival ──────────────────────────────────────────────────────
  minecraft:            { label: 'Minecraft Java Edition',    defaultPort: 25565, emoji: '⛏️', protocol: 'minecraft' },
  minecraftbe:          { label: 'Minecraft Bedrock',         defaultPort: 19132, emoji: '⛏️', protocol: 'bedrock' },
  rust:                 { label: 'Rust',                      defaultPort: 28015, emoji: '🔧', protocol: 'source' },
  valheim:              { label: 'Valheim',                   defaultPort: 2457,  emoji: '⚔️', protocol: 'source' },
  ark:                  { label: 'ARK: Survival Evolved',     defaultPort: 27015, emoji: '🦕', protocol: 'source' },
  asa:                  { label: 'ARK: Survival Ascended',    defaultPort: 27015, emoji: '🦕', protocol: 'source' },
  dayz:                 { label: 'DayZ',                      defaultPort: 27016, emoji: '🧟', protocol: 'source' },
  projectzomboid:       { label: 'Project Zomboid',           defaultPort: 16261, emoji: '🧟', protocol: 'source' },
  sevendaystodie:       { label: '7 Days to Die',             defaultPort: 26900, emoji: '🧟', protocol: 'source' },
  conanexiles:          { label: 'Conan Exiles',              defaultPort: 27015, emoji: '⚔️', protocol: 'source' },
  vrising:              { label: 'V Rising',                  defaultPort: 9876,  emoji: '🧛', protocol: 'source' },
  palworld:             { label: 'Palworld',                  defaultPort: PALWORLD_GAME_PORT, emoji: '🌿', protocol: 'palworld' },
  scum:                 { label: 'SCUM',                      defaultPort: 7042,  emoji: '🏝️', protocol: 'source' },
  hurtworld:            { label: 'Hurtworld',                 defaultPort: 12871, emoji: '🌵', protocol: 'source' },
  miscreated:           { label: 'Miscreated',                defaultPort: 64090, emoji: '🌲', protocol: 'source' },
  theforest:            { label: 'The Forest',                defaultPort: 27016, emoji: '🌲', protocol: 'source' },
  empyrion:             { label: 'Empyrion',                  defaultPort: 30000, emoji: '🚀', protocol: 'source' },
  avorion:              { label: 'Avorion',                   defaultPort: 27000, emoji: '🚀', protocol: 'source' },
  spaceengineers:       { label: 'Space Engineers',           defaultPort: 27016, emoji: '🚀', protocol: 'source' },
  stationeers:          { label: 'Stationeers',               defaultPort: 27500, emoji: '🛸', protocol: 'source' },

  // ── Co-op ───────────────────────────────────────────────────────────────────
  satisfactory:         { label: 'Satisfactory',              defaultPort: 7777,  emoji: '🏭', protocol: 'satisfactory' },
  terraria:             { label: 'Terraria (TShock)',         defaultPort: 7878,  emoji: '🌳', protocol: 'terraria' },
  barotrauma:           { label: 'Barotrauma',                defaultPort: 27015, emoji: '🌊', protocol: 'source' },
  killingfloor2:        { label: 'Killing Floor 2',           defaultPort: 7777,  emoji: '🔪', protocol: 'source' },
  l4d2:                 { label: 'Left 4 Dead 2',             defaultPort: 27015, emoji: '🧟', protocol: 'source' },
  unturned:             { label: 'Unturned',                  defaultPort: 27015, emoji: '🧟', protocol: 'source' },

  // ── Competitive / FPS ───────────────────────────────────────────────────────
  cs2:                  { label: 'Counter-Strike 2',          defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  csgo:                 { label: 'CS:GO',                     defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  css:                  { label: 'Counter-Strike: Source',    defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  tf2:                  { label: 'Team Fortress 2',           defaultPort: 27015, emoji: '🔫', protocol: 'source' },
  gmod:                 { label: "Garry's Mod",               defaultPort: 27015, emoji: '🔧', protocol: 'source' },
  blackmesa:            { label: 'Black Mesa',                defaultPort: 27015, emoji: '🔬', protocol: 'source' },
  insurgencysandstorm:  { label: 'Insurgency: Sandstorm',     defaultPort: 27131, emoji: '💣', protocol: 'source' },
  squad:                { label: 'Squad',                     defaultPort: 27165, emoji: '🪖', protocol: 'source' },
  postscriptum:         { label: 'Post Scriptum',             defaultPort: 10037, emoji: '🪖', protocol: 'source' },
  hellletloose:         { label: 'Hell Let Loose',            defaultPort: 26420, emoji: '🪖', protocol: 'source' },
  mordhau:              { label: 'Mordhau',                   defaultPort: 7777,  emoji: '⚔️', protocol: 'source' },
  groundbranch:         { label: 'Ground Branch',             defaultPort: 27015, emoji: '🔫', protocol: 'source' },
  pavlovvr:             { label: 'Pavlov VR',                 defaultPort: 7777,  emoji: '🎮', protocol: 'source' },

  // ── Arena / Retro (id Tech, Unreal, GameSpy) ────────────────────────────────
  quake3:               { label: 'Quake III Arena',           defaultPort: 27960, emoji: '🔺', protocol: 'quake3' },
  cod4:                 { label: 'Call of Duty 4',            defaultPort: 28960, emoji: '🔫', protocol: 'quake3' },
  doom3:                { label: 'Doom 3',                    defaultPort: 27666, emoji: '👹', protocol: 'doom3' },
  ut2004:               { label: 'Unreal Tournament 2004',    defaultPort: 7778,  emoji: '🎯', protocol: 'unreal2' },
  bf1942:               { label: 'Battlefield 1942',          defaultPort: 23000, emoji: '✈️', protocol: 'gamespy2' },

  // ── Racing ──────────────────────────────────────────────────────────────────
  assettocorsa:         { label: 'Assetto Corsa',             defaultPort: 8081,  emoji: '🏎️', protocol: 'assettocorsa' },
  wreckfest:            { label: 'Wreckfest',                 defaultPort: 27015, emoji: '🏁', protocol: 'source' },

  // ── GTA / Multiplayer mods ──────────────────────────────────────────────────
  fivem:                { label: 'FiveM (GTA V)',             defaultPort: 30120, emoji: '🚗', protocol: 'fivem' },
  mtasa:                { label: 'Multi Theft Auto',          defaultPort: 22126, emoji: '🚗', protocol: 'ase' },
  samp:                 { label: 'SA-MP',                     defaultPort: 7777,  emoji: '🚗', protocol: 'samp' },
  openmp:               { label: 'open.mp',                   defaultPort: 7777,  emoji: '🚗', protocol: 'samp' },

  // ── Mil-Sim / Open World ────────────────────────────────────────────────────
  arma3:                { label: 'Arma 3',                    defaultPort: 2303,  emoji: '🪖', protocol: 'source' },

  // ── Voice (queryable alongside game servers) ────────────────────────────────
  teamspeak3:           { label: 'TeamSpeak 3',               defaultPort: 10011, emoji: '🎙️', protocol: 'teamspeak3' },
  mumble:               { label: 'Mumble',                    defaultPort: 64738, emoji: '🎙️', protocol: 'mumble' },
};

/** Query timeout for GameQuery lookups, in milliseconds. */
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
 * Uses minecraft-server-util for its SRV-record resolution (a domain can point at
 * a server on another host/port), falling back to GameQuery's `minecraft`
 * protocol when SLP fails (e.g. some proxied/modded setups).
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

/** Maps a GameQuery result onto our own status shape using its normalized accessors. */
function toStatus(result: Result, host: string, port: number): QueryResult {
  const version = typeof result.data.version === 'string' ? result.data.version : null;
  return {
    online: true,
    serverName: result.name() ?? host,
    map: result.map() ?? version ?? 'Unknown',
    players: result.players() ?? result.playerNames().length,
    maxPlayers: result.maxPlayers() ?? 0,
    playerList: result.playerNames(),
    bots: typeof result.data.bots === 'number' ? result.data.bots : 0,
    ping: Math.round(result.pingMs),
    password: Boolean(result.data.password_protected),
    connect: `${host}:${port}`,
  };
}

/** Queries a server through GameQuery on the given protocol and maps the result. */
async function queryGameQuery(
  protocol: string,
  host: string,
  port: number,
  options: Record<string, unknown> = {},
): Promise<ServerStatus> {
  try {
    const results = await new GameQuery(QUERY_TIMEOUT_MS, QUERY_RETRIES)
      .addServer(protocol, `${host}:${port}`, null, options)
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
 * PalWorldSettings.ini, and we need its `AdminPassword`. We keep a bespoke
 * handler (rather than GameQuery's `palworld`) because it also reads /metrics for
 * the max-player count.
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

  // Terraria (TShock): the /v2/server/status endpoint is public, so we query it
  // anonymously. A token is only needed if an admin locked the endpoint down —
  // passed through if the server happens to have one stored.
  if (game === 'terraria') {
    return queryGameQuery('terraria', host, resolvedPort, auth?.password ? { token: auth.password } : {});
  }

  // Minecraft Java keeps its own handler for SRV support; everything else is
  // queried through GameQuery on the protocol its game entry declares.
  if (game === 'minecraft') return queryMinecraft(host, resolvedPort);

  return queryGameQuery(gameInfo?.protocol ?? 'source', host, resolvedPort);
}
