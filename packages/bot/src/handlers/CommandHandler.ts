/**
 * Loads slash commands from disk into the client.
 *
 * Commands live in `src/commands/<category>/<name>.ts`, one command per file.
 * On startup we walk every category folder, import each file, and register the
 * command it default-exports. Addons can also add or remove commands at
 * runtime through `registerCommand` / `unregisterCommand`.
 */
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotClient } from '../client.js';
import type { BotCommand } from '../types.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class CommandHandler {
  private client: BotClient;

  constructor(client: BotClient) {
    this.client = client;
  }

  async loadCommands(): Promise<void> {
    // Each sub-folder of `commands/` is a category (moderation, music, …).
    const commandsPath = join(__dirname, '..', 'commands');
    const categories = readdirSync(commandsPath).filter((dir) =>
      statSync(join(commandsPath, dir)).isDirectory()
    );

    for (const category of categories) {
      const categoryPath = join(commandsPath, category);
      // Accept the compiled `.js` in production and `.ts` in dev, but skip the
      // `.d.ts` type declaration files.
      const commandFiles = readdirSync(categoryPath).filter((f) => f.endsWith('.js') || (f.endsWith('.ts') && !f.endsWith('.d.ts')));

      for (const file of commandFiles) {
        const filePath = join(categoryPath, file);
        const fileUrl = pathToFileURL(filePath).href;

        try {
          const module = await import(fileUrl);
          const command: BotCommand = module.default ?? module.command;

          // A valid command must carry its slash-command definition (`data`)
          // and a handler (`execute`); anything else is skipped with a warning.
          if (!command || !('data' in command) || !('execute' in command)) {
            logger.warn(`Command at ${filePath} is missing 'data' or 'execute'`);
            continue;
          }

          this.client.commands.set(command.data.name, command);
          logger.debug(`Loaded command: ${command.data.name}`);
        } catch (err) {
          // One bad command file shouldn't stop the rest from loading.
          logger.error({ err }, `Failed to load command: ${filePath}`);
        }
      }
    }

    logger.info(`Loaded ${this.client.commands.size} commands`);
  }

  // Used by addons to add a command after startup.
  registerCommand(command: BotCommand): void {
    this.client.commands.set(command.data.name, command);
    logger.info(`Registered addon command: ${command.data.name}`);
  }

  // Used when an addon is unloaded, to take its command back out.
  unregisterCommand(name: string): void {
    this.client.commands.delete(name);
    logger.info(`Unregistered command: ${name}`);
  }
}
