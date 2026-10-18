/**
 * Shared event types: the dashboard WebSocket messages and the internal Redis pub/sub events that bridge the API and bot.
 */
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
  | 'log:entry'
  | 'ticket:updated';

export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  guildId?: string;
  data: T;
  timestamp: number;
}

export type InternalEventType =
  | 'settings:reload'
  | 'addon:reload'
  | 'guild:joined'
  | 'guild:left';

export interface InternalEvent<T = unknown> {
  type: InternalEventType;
  data: T;
}
