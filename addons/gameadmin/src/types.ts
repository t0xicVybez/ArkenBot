/** A game server an admin has configured for RCON control, stored per-guild. */
export interface SavedGameServer {
  id: string;
  name: string;
  game: string;
  host: string;
  port: number;
  /** RCON password, sealed with AES-256-GCM (see crypto.ts). */
  password: string;
}
