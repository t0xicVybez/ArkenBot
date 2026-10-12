/**
 * telnet — part of the gameadmin addon's rcon layer.
 */
import { Socket } from 'net';
import { RconError } from './source.js';

export function telnetCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 9000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let output = '';
    let sentCommand = false;
    let settled = false;
    let quietTimer: NodeJS.Timeout | undefined;

    const done = (err: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (quietTimer) clearTimeout(quietTimer);
      try { socket.write('exit\n'); } catch {  }
      socket.destroy();
      if (err) return reject(err);

      const lines = output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/password|logon|connected|please enter|^\*\*\*/i.test(l) && l !== command);
      resolve(lines.join('\n').trim());
    };

    const hardTimer = setTimeout(() => done(new RconError('Timed out talking to the server (check host/Telnet port and that Telnet admin is enabled).')), timeoutMs);

    socket.on('error', (err) => done(new RconError(`Connection failed: ${err.message}`)));
    socket.connect(port, host, () => {
      socket.write(`${password}\n`);

      setTimeout(() => { socket.write(`${command}\n`); sentCommand = true; }, 500);
    });
    socket.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (!sentCommand) return;

      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => done(null), 800);
    });
  });
}
