import axios from 'axios';
import * as https from 'https';
import * as tls from 'tls';
import type * as stream from 'stream';
import type { ClientRequestArgs } from 'http';

export interface RsmConfig {
  url: string;
  apiKey: string;
  /** SHA-256 cert fingerprint (AA:BB:CC… format) for HTTPS cert pinning via TOFU. */
  fingerprint?: string;
}

export interface RsmServer {
  id: string;
  name: string;
  type: string;
  status: 'Online' | 'Offline' | 'Starting';
  pid: number | null;
  cpu: number | null;
  ramMB: number | null;
  uptimeSeconds: number | null;
}

export interface RsmPlayerList {
  online: number | null;
  max: number | null;
  players: string[];
  note?: string;
  rawOutput?: string;
}

export interface RsmLogs {
  id: string;
  totalLines: number;
  log: string;
}

const client = axios.create({ timeout: 5000 });

function headers(config: RsmConfig) {
  return { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' };
}

/** Normalises a SHA-256 fingerprint (`AA:BB:…`) for comparison. */
export function normaliseFingerprint(fingerprint: string): string {
  return fingerprint.replace(/:/g, '').toLowerCase();
}

/**
 * HTTPS agent that pins a self-signed certificate by SHA-256 fingerprint.
 *
 * RSM panels use self-signed certs, so `rejectUnauthorized` has to stay off —
 * but Node only invokes `checkServerIdentity` when it is ON. Passing both is the
 * trap: the callback never runs, every certificate is accepted, and the
 * connection is wide open to interception while appearing to be pinned.
 *
 * The fingerprint is therefore checked on the TLS socket itself, once the
 * handshake completes, and the socket is destroyed on mismatch — which is what
 * actually severs the connection before any request data is written.
 */
class PinnedAgent extends https.Agent {
  private readonly expected: string;

  constructor(expected: string) {
    super({ rejectUnauthorized: false });
    this.expected = expected;
  }

  /** Node calls this to open the socket for each request. */
  createConnection(
    options: ClientRequestArgs,
    callback?: (err: Error | null, stream: stream.Duplex) => void,
  ): stream.Duplex {
    const socket = tls.connect({
      ...(options as tls.ConnectionOptions),
      rejectUnauthorized: false,
    });

    socket.once('secureConnect', () => {
      const actual = normaliseFingerprint(socket.getPeerCertificate().fingerprint256 ?? '');
      if (actual !== this.expected) {
        socket.destroy(new Error('TLS fingerprint mismatch — possible MITM attack'));
        return;
      }
      callback?.(null, socket);
    });

    return socket;
  }
}

/** Returns a cert-pinned HTTPS agent when the config carries a fingerprint. */
function agentFor(config: RsmConfig): https.Agent | undefined {
  if (!config.fingerprint || !config.url.startsWith('https://')) return undefined;
  return new PinnedAgent(normaliseFingerprint(config.fingerprint));
}

/**
 * Opens a TLS connection purely to read the server's certificate fingerprint
 * (trust-on-first-use). Used when pairing with a panel for the first time, before
 * any fingerprint is known — so there is nothing to pin against yet.
 */
export function captureFingerprint(url: string, timeoutMs = 5000): Promise<string> {
  const { hostname, port } = new URL(url);
  // SNI must carry a hostname, never an IP literal (RFC 6066) — panels are often
  // reached by bare IP, and Node warns then drops it.
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: Number(port) || 443,
        rejectUnauthorized: false,
        ...(isIp ? {} : { servername: hostname }),
      },
      () => {
        const fingerprint = socket.getPeerCertificate().fingerprint256;
        socket.destroy();
        fingerprint ? resolve(fingerprint) : reject(new Error('Server presented no certificate'));
      },
    );
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('TLS handshake timed out')));
    socket.once('error', reject);
  });
}

export async function fetchServers(config: RsmConfig): Promise<RsmServer[]> {
  const agent = agentFor(config);
  const res = await client.get(`${config.url}/api/servers`, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return (res.data as { servers: RsmServer[] }).servers;
}

export async function fetchServer(config: RsmConfig, id: string): Promise<RsmServer> {
  const agent = agentFor(config);
  const res = await client.get(`${config.url}/api/servers/${id}`, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as RsmServer;
}

export async function startServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const agent = agentFor(config);
  const res = await client.post(`${config.url}/api/servers/${id}/start`, {}, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as { message: string };
}

export async function stopServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const agent = agentFor(config);
  const res = await client.post(`${config.url}/api/servers/${id}/stop`, {}, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as { message: string };
}

export async function sendCommand(config: RsmConfig, id: string, command: string): Promise<{ success: boolean; output: string }> {
  const agent = agentFor(config);
  const res = await client.post(`${config.url}/api/servers/${id}/command`, { command }, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as { success: boolean; output: string };
}

export async function fetchPlayers(config: RsmConfig, id: string): Promise<RsmPlayerList> {
  const agent = agentFor(config);
  const res = await client.get(`${config.url}/api/servers/${id}/players`, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as RsmPlayerList;
}

export async function restartServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const agent = agentFor(config);
  const res = await client.post(`${config.url}/api/servers/${id}/restart`, {}, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as { message: string };
}

export async function killServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const agent = agentFor(config);
  const res = await client.post(`${config.url}/api/servers/${id}/kill`, {}, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as { message: string };
}

export async function fetchLogs(config: RsmConfig, id: string): Promise<RsmLogs> {
  const agent = agentFor(config);
  const res = await client.get(`${config.url}/api/servers/${id}/logs`, {
    headers: headers(config),
    ...(agent ? { httpsAgent: agent } : {}),
  });
  return res.data as RsmLogs;
}
