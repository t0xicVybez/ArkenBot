

type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export class AddonEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler = (data) => {
      this.off(event, wrapper);
      return handler(data as T);
    };
    this.on(event, wrapper);
  }

  async emit<T = unknown>(event: string, data?: T): Promise<void> {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    for (const handler of eventHandlers) {
      await handler(data);
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
