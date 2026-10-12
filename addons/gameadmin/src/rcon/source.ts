/**
 * source — part of the gameadmin addon's rcon layer.
 */
import { Socket } from 'net';

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;
const SENTINEL_ID = 0x7fffffff;

export class RconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RconError';
  }
}

function encode(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(bodyBuf.length + 14);
  buf.writeInt32LE(bodyBuf.length + 10, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeInt16LE(0, bodyBuf.length + 12);
  return buf;
}

interface Packet {
  id: number;
  type: number;
  body: string;
}

function sourceRconOnce(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 8000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = Buffer.alloc(0);
    let authed = false;
    const parts: string[] = [];
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const done = (err: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value ?? '');
    };

    const timer = setTimeout(() => done(new RconError('Timed out talking to the server (check host/port and that RCON is enabled).')), timeoutMs);

    socket.on('error', (err) => done(new RconError(`Connection failed: ${err.message}`)));
    socket.on('close', () => {
      if (!settled) done(authed ? null : new RconError('Connection closed before authentication completed.'), parts.join(''));
    });

    socket.connect(port, host, () => {
      socket.write(encode(SERVERDATA_EXECCOMMAND, SERVERDATA_AUTH, password));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString('utf8', 12, size + 4 - 2);
        buffer = buffer.subarray(size + 4);
        handle({ id, type, body });
      }
    });

    function handle(pkt: Packet): void {
      if (!authed) {

        if (pkt.type === SERVERDATA_EXECCOMMAND || pkt.type === SERVERDATA_RESPONSE_VALUE) {
          if (pkt.id === -1) return done(new RconError('Authentication failed — wrong RCON password.'));
          authed = true;

          socket.write(encode(SERVERDATA_EXECCOMMAND, SERVERDATA_EXECCOMMAND, command));
          socket.write(encode(SENTINEL_ID, SERVERDATA_EXECCOMMAND, ''));
        }
        return;
      }
      if (pkt.id === SENTINEL_ID) return done(null, parts.join('').trim());
      if (pkt.type === SERVERDATA_RESPONSE_VALUE) {
        parts.push(pkt.body);

        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => done(null, parts.join('').trim()), 300);
      }
    }
  });
}

export async function sourceRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 8000,
): Promise<string> {
  try {
    return await sourceRconOnce(host, port, password, command, timeoutMs);
  } catch (err) {
    if (err instanceof RconError && /Authentication failed/i.test(err.message)) throw err;
    await new Promise((r) => setTimeout(r, 600));
    return sourceRconOnce(host, port, password, command, timeoutMs);
  }
}
