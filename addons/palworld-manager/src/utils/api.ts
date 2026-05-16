function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))]);
}

export async function palApi<T = unknown>(
  host: string, port: number, password: string,
  method: 'GET' | 'POST', endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const auth = Buffer.from(`admin:${password}`).toString('base64');
  const url = `http://${host}:${port}${endpoint}`;
  let res: Response;
  try {
    res = await withTimeout(fetch(url, {
      method,
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }), 8000);
  } catch (err) {
    throw new Error(`Could not reach Palworld server: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 401) throw new Error('Authentication failed — check your admin password');
  if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
