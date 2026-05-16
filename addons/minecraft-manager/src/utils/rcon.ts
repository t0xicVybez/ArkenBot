import { Rcon } from 'rcon-client';

export async function sendRcon(host: string, port: number, password: string, command: string): Promise<string> {
  const rcon = new Rcon({ host, port, password, timeout: 8000 });
  try {
    await rcon.connect();
    return await rcon.send(command);
  } finally {
    await rcon.end().catch(() => {});
  }
}
