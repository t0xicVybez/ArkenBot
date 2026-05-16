/** RCON client helper for ARK: Survival Evolved servers. */
import { Rcon } from 'rcon-client';

/**
 * Opens an RCON connection, sends a command, and closes the connection.
 * Always closes the connection in the `finally` block to prevent socket leaks,
 * even if the command throws.
 *
 * @param host - Server IP or hostname.
 * @param port - RCON port (default ARK port is 27020).
 * @param password - RCON password.
 * @param command - The RCON command string to execute.
 * @returns The server's response string.
 */
export async function sendRcon(host: string, port: number, password: string, command: string): Promise<string> {
  const rcon = new Rcon({ host, port, password, timeout: 8000 });
  try {
    await rcon.connect();
    return await rcon.send(command);
  } finally {
    await rcon.end().catch(() => {});
  }
}
