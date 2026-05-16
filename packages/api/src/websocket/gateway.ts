/**
 * WebSocket gateway for real-time dashboard updates. Clients authenticate
 * with a JWT after connecting and subscribe to specific guild IDs. Events
 * originating from the bot arrive via Redis pub/sub and are forwarded to
 * all relevant connected clients.
 */
import type { FastifyInstance } from 'fastify';
import { sub, pub } from '../redis.js';

interface WebSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
}
import { logger } from '../logger.js';
import type { WebSocketEvent, WebSocketEventType } from '@arkenbot/shared';

interface WSClient {
  ws: WebSocket;
  userId: string;
  guildIds: Set<string>;
  isStaff: boolean;
}

/** Active WebSocket clients keyed by a transient connection ID. */
const clients = new Map<string, WSClient>();

/**
 * Registers the `/ws` WebSocket route and subscribes to the Redis channels
 * used by the bot to emit events. Incoming Redis messages are forwarded to
 * connected clients that have subscribed to the relevant guild.
 */
export async function setupWebSocket(server: FastifyInstance): Promise<void> {
  await sub.subscribe('bot:events');
  await sub.subscribe('api:ws:broadcast');

  sub.on('message', (channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);

      if (channel === 'bot:events') {
        // Map internal bot event types to their WebSocket equivalents.
        const typeMap: Record<string, WebSocketEventType> = {
          'guild:left': 'guild:left',
          'guild:joined': 'guild:joined',
          'bot:ready': 'bot:ready',
        };
        const wsType = typeMap[parsed.type];
        if (wsType) {
          broadcastEvent({ type: wsType, data: parsed.data, timestamp: Date.now() });
        }
      } else {
        // api:ws:broadcast messages are already in WebSocketEvent format.
        broadcastEvent(parsed as WebSocketEvent);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse Redis message');
    }
  });

  server.get('/ws', { websocket: true }, (socket, request) => {
    let client: WSClient | null = null;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    logger.debug(`WebSocket client connected: ${clientId}`);

    socket.on('message', async (raw: { toString(): string }) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          token?: string;
          guildIds?: string[];
        };

        if (msg.type === 'auth') {
          try {
            const payload = server.jwt.verify<{ sub: string }>(msg.token ?? '');
            const { prisma } = await import('../database.js');
            const user = await prisma.portalUser.findUnique({ where: { id: payload.sub } });

            if (!user) {
              socket.send(JSON.stringify({ type: 'auth:error', error: 'User not found' }));
              socket.close();
              return;
            }

            client = {
              ws: socket as unknown as WebSocket,
              userId: user.id,
              guildIds: new Set(msg.guildIds ?? []),
              isStaff: user.isStaff || user.isBotOwner,
            };

            clients.set(clientId, client);
            socket.send(JSON.stringify({ type: 'auth:success', userId: user.id }));
            logger.debug(`WebSocket authenticated: ${user.username}`);
          } catch {
            socket.send(JSON.stringify({ type: 'auth:error', error: 'Invalid token' }));
            socket.close();
          }
        } else if (msg.type === 'subscribe:guilds' && client) {
          client.guildIds = new Set(msg.guildIds ?? []);
          socket.send(JSON.stringify({ type: 'subscribed', guildIds: [...client.guildIds] }));
        } else if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        logger.debug('Invalid WebSocket message');
      }
    });

    socket.on('close', () => {
      clients.delete(clientId);
      logger.debug(`WebSocket client disconnected: ${clientId}`);
    });

    socket.on('error', (err: Error) => {
      logger.error({ err }, 'WebSocket error');
      clients.delete(clientId);
    });
  });
}

/**
 * Sends a WebSocket event to all eligible connected clients.
 *
 * Guild-scoped events are delivered to staff and to clients subscribed to
 * that guild. Global events (no `guildId`) are delivered to staff only.
 * Clients whose connections are no longer open (readyState !== OPEN) are skipped.
 */
function broadcastEvent(event: WebSocketEvent): void {
  const message = JSON.stringify(event);

  for (const [, client] of clients) {
    try {
      if (client.ws.readyState !== 1) continue; // 1 = OPEN

      if (event.guildId) {
        if (client.isStaff || client.guildIds.has(event.guildId)) {
          client.ws.send(message);
        }
      } else {
        if (client.isStaff) {
          client.ws.send(message);
        }
      }
    } catch {
      // Ignore errors from clients that closed between the readyState check and send.
    }
  }
}

/**
 * Publishes a guild-scoped event to the `api:ws:broadcast` Redis channel so it
 * is forwarded to all connected WebSocket clients across every API process.
 */
export async function broadcastToGuild(guildId: string, event: Omit<WebSocketEvent, 'guildId'>): Promise<void> {
  const fullEvent: WebSocketEvent = { ...event, guildId, timestamp: Date.now() };
  await pub.publish('api:ws:broadcast', JSON.stringify(fullEvent));
}

/** Returns the number of currently connected WebSocket clients. */
export function getConnectedClientCount(): number {
  return clients.size;
}
