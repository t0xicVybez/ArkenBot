
import { execFile } from 'node:child_process';

export interface Pm2Memory {

  botMb: number | null;

  totalMb: number | null;
}

interface Pm2Entry {
  name?: string;
  monit?: { memory?: number };
}

const TTL_MS = 5000;
let cache: { at: number; value: Pm2Memory } | null = null;

export async function getPm2Memory(): Promise<Pm2Memory> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const value = await new Promise<Pm2Memory>((resolve) => {
    execFile('pm2', ['jlist'], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ botMb: null, totalMb: null });
      try {
        const list = JSON.parse(stdout) as Pm2Entry[];
        if (!Array.isArray(list) || list.length === 0) return resolve({ botMb: null, totalMb: null });
        let totalBytes = 0;
        let botBytes: number | null = null;
        for (const proc of list) {
          const mem = proc.monit?.memory ?? 0;
          totalBytes += mem;
          if (proc.name === 'bot') botBytes = mem;
        }
        const toMb = (bytes: number): number => Math.round(bytes / 1048576);
        resolve({ botMb: botBytes != null ? toMb(botBytes) : null, totalMb: toMb(totalBytes) });
      } catch {
        resolve({ botMb: null, totalMb: null });
      }
    });
  });

  cache = { at: Date.now(), value };
  return value;
}
