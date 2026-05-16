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
