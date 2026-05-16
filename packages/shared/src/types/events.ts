/** Event type definitions for WebSocket and internal bus communication. */

/** Events pushed from the API server to connected portal clients over WebSocket. */
export type WebSocketEventType =
  | 'settings:updated'
  | 'moderation:action'
  | 'member:join'
  | 'member:leave'
  | 'message:delete'
  | 'message:edit'
  | 'level:up'
  | 'addon:installed'
  | 'addon:removed'
  | 'bot:stats'
  | 'bot:ready'
  | 'guild:stats'
  | 'guild:joined'
  | 'guild:left'
  | 'automod:action'
  | 'log:entry';

/** Wrapper for a typed WebSocket event payload. */
export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  guildId?: string;
  data: T;
  timestamp: number;
}

/** Events exchanged between the bot process and the API server over the internal event bus. */
export type InternalEventType =
  | 'settings:reload'
  | 'addon:reload'
  | 'guild:joined'
  | 'guild:left';

/** Wrapper for a typed internal event payload. */
export interface InternalEvent<T = unknown> {
  type: InternalEventType;
  data: T;
}
