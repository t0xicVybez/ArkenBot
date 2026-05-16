import WebSocket from 'ws';

export async function sendRustRcon(host: string, port: number, password: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}:${port}/${password}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Request timed out')); }, 8000);
    const id = Date.now();

    ws.on('open', () => {
      ws.send(JSON.stringify({ Identifier: id, Message: command, Name: 'ArkenBot' }));
    });
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { Identifier: number; Message: string };
        if (msg.Identifier === id) { clearTimeout(timer); ws.close(); resolve(msg.Message ?? ''); }
      } catch { /* ignore */ }
    });
    ws.on('error', (err: Error) => { clearTimeout(timer); reject(new Error(`Connection failed: ${err.message}`)); });
  });
}
