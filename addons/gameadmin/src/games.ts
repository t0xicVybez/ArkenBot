/**
 * Per-game RCON dialects. Each game maps the friendly actions (players, say,
 * kick, ban, unban, save, stop) to the raw console command that game expects,
 * plus which transport and default port it uses. Actions left undefined aren't
 * available for that game — the command falls back to a "use /gameadmin exec"
 * hint. Raw `exec` works for every game regardless.
 */
import { sourceRconCommand } from './rcon/source.js';
import { webRconCommand } from './rcon/webrcon.js';
import { telnetCommand } from './rcon/telnet.js';

export type Transport = 'source' | 'webrcon' | 'telnet';

export interface GameDef {
  id: string;
  label: string;
  transport: Transport;
  defaultPort: number;
  /** Shown when configuring — e.g. how to find the RCON password / caveats. */
  note?: string;
  cmd: {
    players?: string;
    say?: (msg: string) => string;
    kick?: (target: string, reason?: string) => string;
    ban?: (target: string, reason?: string) => string;
    unban?: (target: string) => string;
    save?: string;
    stop?: string;
  };
}

const q = (s: string): string => `"${s.replace(/"/g, '')}"`;

export const GAMES: Record<string, GameDef> = {
  minecraft: {
    id: 'minecraft', label: 'Minecraft', transport: 'source', defaultPort: 25575,
    note: 'Set enable-rcon=true, rcon.port and rcon.password in server.properties.',
    cmd: {
      players: 'list',
      say: (m) => `say ${m}`,
      kick: (t, r) => `kick ${t}${r ? ` ${r}` : ''}`,
      ban: (t, r) => `ban ${t}${r ? ` ${r}` : ''}`,
      unban: (t) => `pardon ${t}`,
      save: 'save-all',
      stop: 'stop',
    },
  },
  palworld: {
    id: 'palworld', label: 'Palworld', transport: 'source', defaultPort: 25575,
    note: 'Set RCONEnabled=True, RCONPort and AdminPassword in PalWorldSettings.ini. Kick/ban take a SteamID or PlayerUID.',
    cmd: {
      players: 'ShowPlayers',
      say: (m) => `Broadcast ${m.replace(/\s/g, '_')}`,
      kick: (t) => `KickPlayer ${t}`,
      ban: (t) => `BanPlayer ${t}`,
      unban: (t) => `UnBanPlayer ${t}`,
      save: 'Save',
      stop: 'Shutdown 1 Server_is_shutting_down',
    },
  },
  ark: {
    id: 'ark', label: 'ARK: Survival', transport: 'source', defaultPort: 27020,
    note: 'Enable RCON with RCONEnabled=True and RCONPort in GameUserSettings.ini. Kick/ban take a player ID.',
    cmd: {
      players: 'ListPlayers',
      say: (m) => `Broadcast ${m}`,
      kick: (t) => `KickPlayer ${t}`,
      ban: (t) => `BanPlayer ${t}`,
      unban: (t) => `UnbanPlayer ${t}`,
      save: 'SaveWorld',
      stop: 'DoExit',
    },
  },
  rust: {
    id: 'rust', label: 'Rust', transport: 'webrcon', defaultPort: 28016,
    note: 'Rust uses WebRCON — start the server with +rcon.web 1, +rcon.port and +rcon.password.',
    cmd: {
      players: 'playerlist',
      say: (m) => `say ${q(m)}`,
      kick: (t, r) => `kick ${q(t)}${r ? ` ${q(r)}` : ''}`,
      ban: (t, r) => `ban ${q(t)}${r ? ` ${q(r)}` : ''}`,
      unban: (t) => `unban ${q(t)}`,
      save: 'server.save',
      stop: 'quit',
    },
  },
  valheim: {
    id: 'valheim', label: 'Valheim', transport: 'source', defaultPort: 2458,
    note: 'Valheim has no built-in RCON — install a Source-RCON server mod (e.g. via BepInEx). Broadcast/player-list depend on the mod; raw exec always works.',
    cmd: {
      kick: (t) => `kick ${t}`,
      ban: (t) => `ban ${t}`,
      unban: (t) => `unban ${t}`,
      save: 'save',
    },
  },
  sevendtd: {
    id: 'sevendtd', label: '7 Days to Die', transport: 'telnet', defaultPort: 8081,
    note: '7DTD uses Telnet — set TelnetEnabled=true, TelnetPort and TelnetPassword in serverconfig.xml.',
    cmd: {
      players: 'listplayers',
      say: (m) => `say ${q(m)}`,
      kick: (t, r) => `kick ${t}${r ? ` ${q(r)}` : ''}`,
      ban: (t, r) => `ban add ${t} 365 days${r ? ` ${q(r)}` : ''}`,
      unban: (t) => `ban remove ${t}`,
      save: 'saveworld',
      stop: 'shutdown',
    },
  },
};

export const GAME_CHOICES = Object.values(GAMES).map((g) => ({ name: g.label, value: g.id }));

/** Dispatch a raw command to the right transport for the game. */
export function runGameCommand(
  game: string,
  host: string,
  port: number,
  password: string,
  command: string,
): Promise<string> {
  const def = GAMES[game];
  if (!def) throw new Error(`Unknown game: ${game}`);
  switch (def.transport) {
    case 'webrcon': return webRconCommand(host, port, password, command);
    case 'telnet': return telnetCommand(host, port, password, command);
    default: return sourceRconCommand(host, port, password, command);
  }
}
