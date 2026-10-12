/**
 * Type definitions for the gameadmin addon.
 */
export interface SavedGameServer {
  id: string;
  name: string;
  game: string;
  host: string;
  port: number;

  password: string;
}
