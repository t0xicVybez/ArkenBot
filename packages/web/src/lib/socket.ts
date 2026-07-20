'use client';

/**
 * Singleton WebSocket client and `useWebSocket` hook for the Arken Bot dashboard.
 * The client handles authentication, keep-alive pings, and automatic reconnection.
 */
import { useEffect, useRef } from 'react';
import type { WebSocketEvent, WebSocketEventType } from '@arkenbot/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

type Handler = (event: WebSocketEvent) => void;

/** Manages a single authenticated WebSocket connection with keep-alive and reconnect logic. */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<WebSocketEventType, Set<Handler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect(guildIds: string[] = []) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}/ws`;
    // The httpOnly session cookie is sent automatically on the upgrade handshake,
    // so the server authenticates the connection without any token from JS. We
    // just declare which guilds to receive events for once the socket opens.
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.ws!.send(JSON.stringify({ type: 'subscribe:guilds', guildIds }));

      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketEvent;
        const eventHandlers = this.handlers.get(data.type);
        if (eventHandlers) {
          for (const handler of eventHandlers) {
            handler(data);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.reconnectTimer = setTimeout(() => this.connect(guildIds), 5000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  on(event: WebSocketEventType, handler: Handler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: WebSocketEventType, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  subscribeGuilds(guildIds: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe:guilds', guildIds }));
    }
  }

  isConnected() {
    return this.connected;
  }
}

/** Singleton client shared across the application — import this, not the class directly. */
export const wsClient = new WebSocketClient();

/**
 * Subscribes a component to a WebSocket event type.
 * Stores the handler in a ref to avoid stale closures without re-subscribing on every render.
 */
export function useWebSocket(
  eventType: WebSocketEventType,
  handler: Handler,
  deps: unknown[] = []
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stableHandler: Handler = (event) => handlerRef.current(event);
    return wsClient.on(eventType, stableHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...deps]);
}
