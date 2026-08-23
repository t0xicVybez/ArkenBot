/**
 * Rust WebRCON client. Rust does not use Source RCON — it exposes a WebSocket
 * where you connect to `ws://host:port/password` and exchange JSON messages:
 *   send:    { Identifier: number, Message: string, Name: string }
 *   receive: { Message: string, Identifier: number, Type: string }
 */
import WebSocket from 'ws';
import { RconError } from './source.js';

/** Run a single command against a Rust WebRCON server and return its output. */
export function webRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 8000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 2_147_483_000) + 1;
    const url = `ws://${host}:${port}/${encodeURIComponent(password)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: timeoutMs });
    } catch (err) {
      reject(new RconError(`Connection failed: ${(err as Error).message}`));
      return;
    }
    let settled = false;

    const done = (err: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value ?? '');
    };

    const timer = setTimeout(() => done(new RconError('Timed out talking to the server (check host/RCON port and password).')), timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ Identifier: id, Message: command, Name: 'ArkenBot' }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { Message?: string; Identifier?: number };
        if (msg.Identifier === id || msg.Identifier === 0) done(null, (msg.Message ?? '').trim());
      } catch {
        done(null, raw.toString().trim());
      }
    });
    ws.on('error', (err) => done(new RconError(`Connection failed: ${err.message} (is WebRCON enabled with +rcon.web 1?)`)));
    ws.on('close', () => { if (!settled) done(new RconError('Connection closed before a response — check the RCON password.')); });
  });
}
