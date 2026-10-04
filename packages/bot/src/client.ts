/**
 * Extended discord.js Client that carries the bot's command registry and
 * pre-configures the full set of gateway intents required by all built-in modules.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Options,
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
        // GuildMessageTyping intentionally omitted — no feature handles typing
        // events, and they're extremely high-volume (every keystroke, every
        // guild), so subscribing just burns gateway traffic and GC.
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
      // Bound the message cache and sweep stale entries so memory doesn't creep
      // up over long uptimes. Only MessageManager is capped here: members,
      // presences, and users are left at defaults because live features read
      // them (online-count stats channels, role-gated XP/lottery, etc.), and
      // sweeping users out from under cached members can crash member.user.
      // Messages are safe to drop — reaction-role/starboard handlers refetch
      // partial messages on demand.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 1800, lifetime: 1800 },
      },
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
