
import { GameQuery, type Result } from '@t0xicvybez/gamequery';
import { status as mcJavaStatus } from 'minecraft-server-util';
import type { QueryAuth, QueryResult, ServerStatus } from './types.js';

export interface GameInfo {
  label: string;

  defaultPort: number;
  emoji: string;

  protocol: string;

  gamePort?: number;
}

const PALWORLD_GAME_PORT = 8211;

export const PALWORLD_REST_PORT = 8212;

export const AUTHENTICATED_GAMES = new Set(['palworld']);

class UnauthorizedError extends Error {}

export const SUPPORTED_GAMES: Record<string, GameInfo> = {

  minecraft:            { label: 'Minecraft Java Edition',    defaultPort: 25565, emoji: '⛏️', protocol: 'minecraft' },
  minecraftbe:          { label: 'Minecraft Bedrock',         defaultPort: 19132, emoji: '⛏️', protocol: 'bedrock' },
  rust:                 { label: 'Rust',                      defaultPort: 28015, emoji: '🔧', protocol: 'source' },
  valheim:              { label: 'Valheim',                   defaultPort: 2457,  emoji: '⚔️', protocol: 'source', gamePort: 2456 },
  ark:                  { label: 'ARK: Survival Evolved',     defaultPort: 27015, emoji: '🦕', protocol: 'source' },
  asa:                  { label: 'ARK: Survival Ascended',    defaultPort: 27015, emoji: '🦕', protocol: 'source' },
  dayz:                 { label: 'DayZ',                      defaultPort: 27016, emoji: '🧟', protocol: 'source', gamePort: 2302 },
  projectzomboid:       { label: 'Project Zomboid',           defaultPort: 16261, emoji: '🧟', protocol: 'source' },
  sevendaystodie:       { label: '7 Days to Die',             defaultPort: 26900, emoji: '🧟', protocol: 'source' },
  conanexiles:          { label: 'Conan Exiles',              defaultPort: 27015, emoji: '⚔️', protocol: 'source', gamePort: 7777 },
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

  satisfactory:         { label: 'Satisfactory',              defaultPort: 7777,  emoji: '🏭', protocol: 'satisfactory' },
  terraria:             { label: 'Terraria (TShock)',         defaultPort: 7878,  emoji: '🌳', protocol: 'terraria', gamePort: 7777 },
  barotrauma:           { label: 'Barotrauma',                defaultPort: 27015, emoji: '🌊', protocol: 'source' },
  killingfloor2:        { label: 'Killing Floor 2',           defaultPort: 27015, emoji: '🔪', protocol: 'source', gamePort: 7777 },
  l4d2:                 { label: 'Left 4 Dead 2',             defaultPort: 27015, emoji: '🧟', protocol: 'source' },
  unturned:             { label: 'Unturned',                  defaultPort: 27015, emoji: '🧟', protocol: 'source' },

  cs2:                  { label: 'Counter-Strike 2',          defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  csgo:                 { label: 'CS:GO',                     defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  css:                  { label: 'Counter-Strike: Source',    defaultPort: 27015, emoji: '🎯', protocol: 'source' },
  tf2:                  { label: 'Team Fortress 2',           defaultPort: 27015, emoji: '🔫', protocol: 'source' },
  gmod:                 { label: "Garry's Mod",               defaultPort: 27015, emoji: '🔧', protocol: 'source' },
  blackmesa:            { label: 'Black Mesa',                defaultPort: 27015, emoji: '🔬', protocol: 'source' },
  insurgencysandstorm:  { label: 'Insurgency: Sandstorm',     defaultPort: 27131, emoji: '💣', protocol: 'source', gamePort: 27102 },
  squad:                { label: 'Squad',                     defaultPort: 27165, emoji: '🪖', protocol: 'source', gamePort: 7787 },
  postscriptum:         { label: 'Post Scriptum',             defaultPort: 10037, emoji: '🪖', protocol: 'source', gamePort: 10027 },
  hellletloose:         { label: 'Hell Let Loose',            defaultPort: 26420, emoji: '🪖', protocol: 'source' },
  mordhau:              { label: 'Mordhau',                   defaultPort: 7777,  emoji: '⚔️', protocol: 'source' },
  groundbranch:         { label: 'Ground Branch',             defaultPort: 27015, emoji: '🔫', protocol: 'source' },
  pavlovvr:             { label: 'Pavlov VR',                 defaultPort: 7777,  emoji: '🎮', protocol: 'source' },

  quake3:               { label: 'Quake III Arena',           defaultPort: 27960, emoji: '🔺', protocol: 'quake3' },
  cod4:                 { label: 'Call of Duty 4',            defaultPort: 28960, emoji: '🔫', protocol: 'quake3' },
  doom3:                { label: 'Doom 3',                    defaultPort: 27666, emoji: '👹', protocol: 'doom3' },
  ut2004:               { label: 'Unreal Tournament 2004',    defaultPort: 7778,  emoji: '🎯', protocol: 'unreal2', gamePort: 7777 },
  bf1942:               { label: 'Battlefield 1942',          defaultPort: 23000, emoji: '✈️', protocol: 'gamespy2' },

  assettocorsa:         { label: 'Assetto Corsa',             defaultPort: 8081,  emoji: '🏎️', protocol: 'assettocorsa', gamePort: 9600 },
  wreckfest:            { label: 'Wreckfest',                 defaultPort: 27015, emoji: '🏁', protocol: 'source' },

  fivem:                { label: 'FiveM (GTA V)',             defaultPort: 30120, emoji: '🚗', protocol: 'fivem' },
  mtasa:                { label: 'Multi Theft Auto',          defaultPort: 22126, emoji: '🚗', protocol: 'ase', gamePort: 22003 },
  samp:                 { label: 'SA-MP',                     defaultPort: 7777,  emoji: '🚗', protocol: 'samp' },
  openmp:               { label: 'open.mp',                   defaultPort: 7777,  emoji: '🚗', protocol: 'samp' },

  arma3:                { label: 'Arma 3',                    defaultPort: 2303,  emoji: '🪖', protocol: 'source', gamePort: 2302 },

  teamspeak3:           { label: 'TeamSpeak 3',               defaultPort: 10011, emoji: '🎙️', protocol: 'teamspeak3', gamePort: 9987 },
  mumble:               { label: 'Mumble',                    defaultPort: 64738, emoji: '🎙️', protocol: 'mumble' },
};

const QUERY_TIMEOUT_MS = 8000;

const QUERY_RETRIES = 2;

function classifyError(err: unknown): string {

  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  const msg = `${err instanceof Error ? err.message : String(err)} ${cause}`.trim();

  if (
    msg.includes('Failed after') || msg.includes('Failed all') ||
    msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('timeout') ||
    msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH') || msg.includes('Timed out') ||

    msg.includes('send failed')
  ) return 'Server did not respond (offline or unreachable)';
  if (msg.includes('ECONNREFUSED')) return 'Connection refused — is the query port open?';
  if (msg.includes('ENOTFOUND') || msg.includes('ENOENT')) return 'Host not found — check the address';
  return msg.split('\n')[0].slice(0, 200);
}

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

function toStatus(result: Result, host: string, connectPort: number): QueryResult {
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
    connect: `${host}:${connectPort}`,
  };
}

async function queryGameQuery(
  protocol: string,
  host: string,
  port: number,
  options: Record<string, unknown> = {},
  connectPort: number = port,
): Promise<ServerStatus> {
  try {
    const results = await new GameQuery(QUERY_TIMEOUT_MS, QUERY_RETRIES)
      .addServer(protocol, `${host}:${port}`, null, options)
      .process();

    const result = results[0];
    if (!result || !result.online) {
      return { online: false, error: classifyError(result?.error ?? 'Server did not respond (offline or unreachable)') };
    }
    return toStatus(result, host, connectPort);
  } catch (err) {
    return { online: false, error: classifyError(err) };
  }
}

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

export async function queryServer(
  game: string,
  host: string,
  port?: number,
  auth?: QueryAuth,
): Promise<ServerStatus> {
  const gameInfo = SUPPORTED_GAMES[game];
  const resolvedPort = port ?? gameInfo?.defaultPort ?? 27015;

  const connectPort = port === undefined ? (gameInfo?.gamePort ?? resolvedPort) : resolvedPort;

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

  if (game === 'terraria') {
    return queryGameQuery('terraria', host, resolvedPort, auth?.password ? { token: auth.password } : {}, connectPort);
  }

  if (game === 'minecraft') return queryMinecraft(host, resolvedPort);

  return queryGameQuery(gameInfo?.protocol ?? 'source', host, resolvedPort, {}, connectPort);
}
