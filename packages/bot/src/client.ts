/**
 * Extended discord.js Client that carries the bot's command registry and
 * pre-configures the full set of gateway intents required by all built-in modules.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from 'discord.js';
import type { BotCommand } from './types.js';
import { installRestErrorInterceptor } from './utils/restErrorInterceptor.js';

/**
 * The central Discord client for ArkenBot. Extends the discord.js `Client` with
 * a typed command collection and the intents needed by all built-in modules.
 *
 * Partials are enabled for Message, Channel, Reaction, GuildMember, and User so
 * that reaction-role and starboard events fire on messages that were sent before
 * the bot started.
 */
export class BotClient extends Client {
  /** All loaded slash commands and context-menu commands, keyed by command name. */
  public commands = new Collection<string, BotCommand>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User,
      ],
      // Suppress @everyone pings and prevent the bot from pinging the author of
      // the message it replies to by default.
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false,
      },
    });

    // Catch-all: surface any missing-permission API failure as an admin alert.
    installRestErrorInterceptor(this);
  }
}
