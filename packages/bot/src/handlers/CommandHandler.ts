/**
 * Discovers and loads slash command modules from the `src/commands` directory,
 * and provides helpers for dynamically registering and unregistering commands
 * at runtime (used by AddonHandler).
 */

import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotClient } from '../client.js';
import type { BotCommand } from '../types.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Loads all file-based commands into the client's command collection at startup. */
export class CommandHandler {
  private client: BotClient;

  constructor(client: BotClient) {
    this.client = client;
  }

  /**
   * Recursively reads each category subdirectory under `src/commands` and imports
   * every `.js` (or uncompiled `.ts`) file as a `BotCommand` module.
   */
  async loadCommands(): Promise<void> {
    const commandsPath = join(__dirname, '..', 'commands');
    const categories = readdirSync(commandsPath).filter((dir) =>
      statSync(join(commandsPath, dir)).isDirectory()
    );

    for (const category of categories) {
      const categoryPath = join(commandsPath, category);
      const commandFiles = readdirSync(categoryPath).filter((f) => f.endsWith('.js') || (f.endsWith('.ts') && !f.endsWith('.d.ts')));

      for (const file of commandFiles) {
        const filePath = join(categoryPath, file);
        const fileUrl = pathToFileURL(filePath).href;

        try {
          const module = await import(fileUrl);
          const command: BotCommand = module.default ?? module.command;

          if (!command || !('data' in command) || !('execute' in command)) {
            logger.warn(`Command at ${filePath} is missing 'data' or 'execute'`);
            continue;
          }

          this.client.commands.set(command.data.name, command);
          logger.debug(`Loaded command: ${command.data.name}`);
        } catch (err) {
          logger.error({ err }, `Failed to load command: ${filePath}`);
        }
      }
    }

    logger.info(`Loaded ${this.client.commands.size} commands`);
  }

  /**
   * Adds a command to the client's command collection at runtime.
   * Used by `AddonHandler` when an addon defines commands.
   */
  registerCommand(command: BotCommand): void {
    this.client.commands.set(command.data.name, command);
    logger.info(`Registered addon command: ${command.data.name}`);
  }

  /**
   * Removes a command from the client's command collection at runtime.
   * Used by `AddonHandler` when an addon is deactivated.
   */
  unregisterCommand(name: string): void {
    this.client.commands.delete(name);
    logger.info(`Unregistered command: ${name}`);
  }
}
