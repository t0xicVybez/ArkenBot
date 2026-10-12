

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

        if (event.once) {
          this.client.once(event.name, (...args) => event.execute(this.client, ...args));
        } else {
          this.client.on(event.name, (...args) => event.execute(this.client, ...args));
        }

        logger.debug(`Loaded event: ${event.name}`);
      } catch (err) {
        logger.error({ err }, `Failed to load event: ${filePath}`);
      }
    }

    logger.info(`Loaded ${eventFiles.length} events`);
  }
}
