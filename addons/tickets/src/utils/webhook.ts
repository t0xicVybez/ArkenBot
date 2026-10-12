/**
 * webhook helpers for the tickets addon.
 */
export async function fireWebhook(url: string, payload: object): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
