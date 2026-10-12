/**
 * Loads gateway event listeners from disk and binds them to the client.
 *
 * Each file in `src/events/` default-exports a `BotEvent` — a Discord event
 * name plus an `execute` function. We attach every one to the client, using
 * `once` for events that should only fire a single time (like `clientReady`).
 */
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotClient } from '../client.js';
import type { BotEvent } from '../types.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class EventHandler {
  private client: BotClient;

  constructor(client: BotClient) {
    this.client = client;
  }

  async loadEvents(): Promise<void> {
    const eventsPath = join(__dirname, '..', 'events');
    // Compiled `.js` in production, `.ts` in dev; never the `.d.ts` files.
    const eventFiles = readdirSync(eventsPath).filter((f) => f.endsWith('.js') || (f.endsWith('.ts') && !f.endsWith('.d.ts')));

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      try {
        const module = await import(fileUrl);
        const event: BotEvent = module.default ?? module.event;

        if (!event || !event.name || !event.execute) {
          logger.warn(`Event at ${filePath} is missing required fields`);
          continue;
        }

        // Pass the client as the first argument to every listener so events
        // don't each have to reach for it themselves.
        if (event.once) {
          this.client.once(event.name, (...args) => event.execute(this.client, ...args));
        } else {
          this.client.on(event.name, (...args) => event.execute(this.client, ...args));
        }

        logger.debug(`Loaded event: ${event.name}`);
      } catch (err) {
        // Skip a broken event file rather than failing the whole startup.
        logger.error({ err }, `Failed to load event: ${filePath}`);
      }
    }

    logger.info(`Loaded ${eventFiles.length} events`);
  }
}
