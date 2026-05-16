/**
 * A lightweight typed event bus for inter-addon and addon-to-core communication.
 * Handlers are invoked serially in subscription order.
 */

type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export class AddonEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /**
   * Subscribes `handler` to the named event.
   * Returns an unsubscribe function that removes the handler when called.
   *
   * @param event - The event name to listen for.
   * @param handler - The callback invoked when the event is emitted.
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  /**
   * Removes a previously registered handler for the named event.
   *
   * @param event - The event name.
   * @param handler - The handler reference to remove.
   */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Subscribes `handler` to the named event and automatically unsubscribes after the first emit.
   *
   * @param event - The event name to listen for.
   * @param handler - The callback invoked once when the event is emitted.
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler = (data) => {
      this.off(event, wrapper);
      return handler(data as T);
    };
    this.on(event, wrapper);
  }

  /**
   * Emits `event` with the given `data`, awaiting each handler in turn.
   * Does nothing when there are no subscribers.
   *
   * @param event - The event name to emit.
   * @param data - The payload passed to each handler.
   */
  async emit<T = unknown>(event: string, data?: T): Promise<void> {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    for (const handler of eventHandlers) {
      await handler(data);
    }
  }

  /**
   * Removes all handlers for a specific event, or clears all handlers when called
   * without an argument.
   *
   * @param event - The event name to clear. Omit to clear all events.
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
