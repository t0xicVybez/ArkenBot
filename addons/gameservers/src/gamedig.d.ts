declare module 'gamedig' {
  export interface Player {
    name?: string;
    raw?: Record<string, unknown>;
  }

  export interface QueryResult {
    name: string;
    map: string;
    password: boolean;
    maxplayers: number;
    players: Player[];
    bots: Player[];
    connect: string;
    ping: number;
    raw?: Record<string, unknown>;
  }

  export type Type = string;

  export interface QueryOptions {
    type: Type;
    host: string;
    port?: number;
    maxRetries?: number;
    socketTimeout?: number;
    givenPortOnly?: boolean;
  }

  const Gamedig: {
    query(options: QueryOptions): Promise<QueryResult>;
  };

  export default Gamedig;
}
