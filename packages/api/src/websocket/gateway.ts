
import type { FastifyInstance } from 'fastify';
import { sub, pub } from '../redis.js';
import { config } from '../config.js';
import { SessionService } from '../services/SessionService.js';

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

const clients = new Map<string, WSClient>();

export async function setupWebSocket(server: FastifyInstance): Promise<void> {
  await sub.subscribe('bot:events');
  await sub.subscribe('api:ws:broadcast');

  sub.on('message', (channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);

      if (channel === 'bot:events') {

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

        broadcastEvent(parsed as WebSocketEvent);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse Redis message');
    }
  });

  server.get('/ws', { websocket: true }, async (socket, request) => {
    let client: WSClient | null = null;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const sid = request.cookies[config.cookie.name];
    const resolved = sid
      ? await SessionService.resolve(sid, {}, { rotate: false })
      : null;
    if (!resolved) {
      socket.send(JSON.stringify({ type: 'auth:error', error: 'Unauthorized' }));
      socket.close();
      return;
    }

    const { prisma } = await import('../database.js');
    const user = await prisma.portalUser.findUnique({ where: { id: resolved.userId } });
    if (!user) {
      socket.send(JSON.stringify({ type: 'auth:error', error: 'User not found' }));
      socket.close();
      return;
    }

    client = {
      ws: socket as unknown as WebSocket,
      userId: user.id,
      guildIds: new Set(),
      isStaff: user.isStaff || user.isBotOwner,
    };
    clients.set(clientId, client);
    socket.send(JSON.stringify({ type: 'auth:success', userId: user.id }));
    logger.debug(`WebSocket authenticated: ${user.username}`);

    socket.on('message', async (raw: { toString(): string }) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          guildIds?: string[];
        };

        if (msg.type === 'subscribe:guilds' && client) {
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

function broadcastEvent(event: WebSocketEvent): void {
  const message = JSON.stringify(event);

  for (const [, client] of clients) {
    try {
      if (client.ws.readyState !== 1) continue;

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

    }
  }
}

export async function broadcastToGuild(guildId: string, event: Omit<WebSocketEvent, 'guildId'>): Promise<void> {
  const fullEvent: WebSocketEvent = { ...event, guildId, timestamp: Date.now() };
  await pub.publish('api:ws:broadcast', JSON.stringify(fullEvent));
}

export function getConnectedClientCount(): number {
  return clients.size;
}
