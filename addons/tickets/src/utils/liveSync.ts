/**
 * Pushes ticket-change events to the dashboard's live WebSocket gateway.
 *
 * API→bot sync already existed (ticket:panel:updated etc., see index.ts's
 * startPanelSyncListener) — this is the other direction: Discord-side
 * changes (claim, reply, priority, close, new messages typed in the ticket
 * channel...) reaching connected dashboard clients in real time instead of
 * only showing up on the dashboard's next poll.
 *
 * Publishes straight to `api:ws:broadcast`, the same Redis channel the
 * API's own broadcastToGuild() helper uses — the WebSocket gateway relays
 * anything on that channel to subscribed clients regardless of who
 * published it, so no API-side changes were needed for this to work.
 */
import { Redis } from 'ioredis';

let redisPub: Redis | null = null;

export function initLiveSync(): void {
  if (redisPub) return;
  redisPub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  // Best-effort — a dropped live-update never affects the ticket's actual
  // persisted state, so a reconnect loop isn't worth the log noise here.
  redisPub.on('error', () => undefined);
}

export async function closeLiveSync(): Promise<void> {
  await redisPub?.quit().catch(() => undefined);
  redisPub = null;
}

export async function publishTicketUpdate(guildId: string, ticketId: string, channelId: string): Promise<void> {
  if (!redisPub) return;
  try {
    await redisPub.publish('api:ws:broadcast', JSON.stringify({
      type: 'ticket:updated',
      guildId,
      data: { ticketId, channelId },
      timestamp: Date.now(),
    }));
  } catch {
    // best-effort, see above
  }
}
