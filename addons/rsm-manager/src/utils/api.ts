import axios from 'axios';
import * as https from 'https';

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
}

export interface RsmPlayerList {
  online: number | null;
  max: number | null;
  players: string[];
  note?: string;
}

const client = axios.create({ timeout: 5000 });

function headers(config: RsmConfig) {
  return { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' };
}

// Returns a cert-pinned HTTPS agent when the config carries a fingerprint.
// Uses rejectUnauthorized:false (self-signed) but validates the fingerprint
// itself, so a MITM with a different cert will be rejected.
function agentFor(config: RsmConfig): https.Agent | undefined {
  if (!config.fingerprint || !config.url.startsWith('https://')) return undefined;
  const expected = config.fingerprint.replace(/:/g, '').toLowerCase();
  return new https.Agent({
    rejectUnauthorized: false,
    checkServerIdentity: (_host: string, cert: { fingerprint256?: string }) => {
      const actual = (cert.fingerprint256 ?? '').replace(/:/g, '').toLowerCase();
      if (actual !== expected) return new Error('TLS fingerprint mismatch — possible MITM attack');
      return undefined;
    },
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
