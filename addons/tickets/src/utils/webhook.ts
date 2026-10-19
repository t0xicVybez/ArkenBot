/**
 * webhook helpers for the tickets addon.
 */
import { createHmac } from 'crypto';

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;

async function postOnce(url: string, body: string, secret: string | undefined, event: string): Promise<Response> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-ArkenBot-Event': event };
    if (secret) headers['X-ArkenBot-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    return await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Posts a ticket event to a guild's configured webhook URL. Signs the body
 * with HMAC-SHA256 (X-ArkenBot-Signature header, same `sha256=<hex>` format
 * GitHub/Stripe use) when a secret is configured, so the receiver can
 * verify the payload actually came from us and wasn't spoofed — the secret
 * is auto-generated server-side the first time a webhook URL is saved (see
 * the config PATCH route). Retries once on failure (network error or a
 * non-2xx status) after a short delay; still unreachable after that just
 * throws, same as before — callers already .catch() and log a warning,
 * this never blocks the ticket action that triggered it.
 */
export async function fireWebhook(url: string, payload: object, secret?: string): Promise<void> {
  const body = JSON.stringify(payload);
  const event = (payload as { event?: string }).event ?? 'unknown';

  let res: Response;
  try {
    res = await postOnce(url, body, secret, event);
    if (res.ok) return;
  } catch {
    // network error / timeout — fall through to the retry below
  }

  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  res = await postOnce(url, body, secret, event);
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}
