import axios from 'axios';

export interface RsmConfig {
  url: string;
  apiKey: string;
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

const client = axios.create({ timeout: 5000 });

function headers(config: RsmConfig) {
  return { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' };
}

export async function fetchServers(config: RsmConfig): Promise<RsmServer[]> {
  const res = await client.get(`${config.url}/api/servers`, { headers: headers(config) });
  return (res.data as { servers: RsmServer[] }).servers;
}

export async function fetchServer(config: RsmConfig, id: string): Promise<RsmServer> {
  const res = await client.get(`${config.url}/api/servers/${id}`, { headers: headers(config) });
  return res.data as RsmServer;
}

export async function startServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const res = await client.post(`${config.url}/api/servers/${id}/start`, {}, { headers: headers(config) });
  return res.data as { message: string };
}

export async function stopServer(config: RsmConfig, id: string): Promise<{ message: string }> {
  const res = await client.post(`${config.url}/api/servers/${id}/stop`, {}, { headers: headers(config) });
  return res.data as { message: string };
}

export async function sendCommand(config: RsmConfig, id: string, command: string): Promise<{ success: boolean; output: string }> {
  const res = await client.post(`${config.url}/api/servers/${id}/command`, { command }, { headers: headers(config) });
  return res.data as { success: boolean; output: string };
}

export interface RsmPlayerList {
  online: number | null;
  max: number | null;
  players: string[];
  note?: string;
}

export async function fetchPlayers(config: RsmConfig, id: string): Promise<RsmPlayerList> {
  const res = await client.get(`${config.url}/api/servers/${id}/players`, { headers: headers(config) });
  return res.data as RsmPlayerList;
}
