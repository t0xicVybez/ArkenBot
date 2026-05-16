/** Type definitions for the FiveM Manager addon. */

/** Stored connection details and access control lists for a guild. */
export interface FivemConfig {
  /** Base URL of the FiveM server, e.g. `http://45.12.34.56:30120`. */
  serverUrl: string;
  /** Must match the `arkenbot_token` convar configured in `server.cfg`. */
  apiToken: string;
  /** Role IDs allowed to use staff commands (kick, ban, announce, status, players, playerinfo). */
  staffRoles: string[];
  /** Role IDs allowed to use admin commands (giveitem, removemoney, setjob, resource control, etc.). */
  adminRoles: string[];
}

/** A player currently connected to the FiveM server. */
export interface FivemPlayer {
  id: number;
  name: string;
  ping: number;
  identifiers: string[];
}

/** Extended player info returned by the `/fivem player` subcommand. */
export interface FivemPlayerInfo extends FivemPlayer {
  job?: string;
  jobGrade?: number;
  money?: { cash?: number; bank?: number; crypto?: number };
  /** QBCore citizen identifier. */
  citizenid?: string;
  /** ESX player identifier. */
  identifier?: string;
}

/** Server status snapshot returned by the `/fivem status` subcommand. */
export interface FivemStatus {
  playerCount: number;
  maxPlayers: number;
  hostname: string;
  framework: 'qbcore' | 'esx' | 'none';
}
