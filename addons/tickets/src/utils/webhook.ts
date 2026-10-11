/** POST a JSON payload to an external webhook (ticket open/close events). */
export async function fireWebhook(url: string, payload: object): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
