/** Types for saved game server records and query results. */

/** A game server entry saved by a guild administrator. */
export interface SavedServer {
  id: string;
  name: string;
  game: string;
  host: string;
  port?: number;
  addedBy: string;
  addedAt: string;
  /**
   * Admin password, encrypted at rest, for games whose only status API is
   * authenticated (Palworld). See `utils/crypto.ts`.
   */
  credential?: string;
  /** Port of that authenticated API, when it isn't the game port (Palworld REST, default 8212). */
  queryPort?: number;
}

/** Credentials needed to query games with no anonymous status protocol. */
export interface QueryAuth {
  password: string;
  queryPort?: number;
}

/** A successful query result from a reachable game server. */
export interface QueryResult {
  online: true;
  serverName: string;
  map: string;
  players: number;
  maxPlayers: number;
  playerList: string[];
  bots: number;
  ping: number;
  password: boolean;
  connect: string;
}

/** Discriminated union representing a server that is either online or offline. */
export type ServerStatus = QueryResult | { online: false; error: string };
