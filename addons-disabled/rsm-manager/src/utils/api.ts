import axios from 'axios';
import * as https from 'https';
import * as tls from 'tls';

export interface RsmConfig {
  url: string;
  apiKey: string;
  /** PEM of the panel's pinned self-signed certificate, captured on first pairing (TOFU). */
  cert?: string;
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

/**
 * HTTPS agent that pins a panel's self-signed certificate.
 *
 * The captured certificate is installed as the *only* trusted CA, and
 * certificate validation stays ON — so Node rejects any certificate that does
 * not chain to this exact one. A man-in-the-middle presenting a different
 * self-signed certificate fails validation and the request never completes.
 *
 * Hostname verification is the one check we skip: self-signed panel certificates
 * rarely carry a CN/SAN matching the host (they are often issued for `localhost`
 * or a bare IP). The pinned certificate itself is the identity, so a mismatched
 * hostname is expected and not a failure.
 */
function agentFor(config: RsmConfig): https.Agent | undefined {
  if (!config.cert || !config.url.startsWith('https://')) return undefined;
  return new https.Agent({
    ca: config.cert,
    checkServerIdentity: () => undefined,
  });
}

/**
 * Trust-on-first-use: connect once to read the panel's self-signed certificate
 * so it can be pinned for every later request. On this first contact there is no
 * trust anchor to validate against yet, so the presented certificate is accepted
 * as-is and recorded — the same model as SSH accepting a host key the first time.
 */
export function captureCertificate(url: string, timeoutMs = 5000): Promise<string> {
  const { hostname, port } = new URL(url);
  // SNI must carry a hostname, never an IP literal (RFC 6066) — panels are often
  // reached by bare IP, and Node warns then drops it.
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: Number(port) || 443,
        // No trust anchor exists on first pairing; the cert is read, then pinned.
        rejectUnauthorized: false,
        ...(isIp ? {} : { servername: hostname }),
      },
      () => {
        const der = socket.getPeerCertificate().raw;
        socket.destroy();
        if (!der || der.length === 0) {
          reject(new Error('Server presented no certificate'));
          return;
        }
        const body = der.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
        resolve(`-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`);
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
