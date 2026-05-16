/**
 * HTTP client for the ArkenBot FiveM resource API.
 * All requests are sent to the `/arkenbot/execute` endpoint on the game server.
 */

const TIMEOUT_MS = 8000;

/**
 * Races a promise against a timeout, rejecting with a descriptive error when
 * the timeout fires first. This prevents hung connections from blocking the bot.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Sends an action request to the ArkenBot FiveM resource and returns the
 * parsed response data.
 *
 * Throws a descriptive `Error` for network failures, authentication errors,
 * missing resources, or non-success API responses — callers should catch and
 * surface these to the user.
 *
 * @param serverUrl - Base URL of the FiveM server (e.g. `http://IP:port`).
 * @param apiToken - Token matching the `arkenbot_token` convar in `server.cfg`.
 * @param action - The action name to execute on the resource.
 * @param params - Optional parameters forwarded to the action handler.
 */
export async function callServer<T = unknown>(
  serverUrl: string,
  apiToken: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const url = `${serverUrl.replace(/\/$/, '')}/arkenbot/execute`;

  let res: Response;
  try {
    res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: apiToken, action, params: params ?? {} }),
      }),
      TIMEOUT_MS,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach FiveM server: ${msg}`);
  }

  if (res.status === 401) {
    throw new Error('Authentication failed — check that `apiToken` in your config matches `arkenbot_token` in server.cfg');
  }
  if (res.status === 404) {
    throw new Error('ArkenBot resource not found — make sure the `arkenbot` resource is installed and started on your FiveM server');
  }

  let json: { success?: boolean; data?: T; error?: string };
  try {
    json = await res.json() as { success?: boolean; data?: T; error?: string };
  } catch {
    throw new Error(res.ok ? 'Server returned invalid JSON' : `Server returned HTTP ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(json.error ?? `Server returned HTTP ${res.status}`);
  }

  if (json.error) {
    throw new Error(json.error);
  }

  return json.data as T;
}
