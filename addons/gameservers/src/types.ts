

export interface SavedServer {
  id: string;
  name: string;
  game: string;
  host: string;
  port?: number;
  addedBy: string;
  addedAt: string;

  credential?: string;

  queryPort?: number;
}

export interface QueryAuth {
  password: string;
  queryPort?: number;
}

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

export type ServerStatus = QueryResult | { online: false; error: string };
