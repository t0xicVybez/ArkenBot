/**
 * The Discord client.
 *
 * Extends discord.js's `Client` with the exact gateway intents, cached
 * partials, cache limits and default reply behaviour the bot needs. A single
 * instance of this is created at startup and passed everywhere.
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

export class BotClient extends Client {
  // Every loaded slash command, keyed by its name, so handlers can look one up
  // quickly when an interaction arrives.
  public commands = new Collection<string, BotCommand>();

  constructor() {
    super({
      // Intents tell Discord which categories of events to send us. Request
      // only what features actually use — each one is a privacy/scope decision.
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

        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      // Partials let us receive events for objects that aren't fully cached
      // (e.g. a reaction on an old message), rather than silently dropping them.
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User,
      ],

      // Keep memory in check: cap the per-channel message cache and sweep old
      // messages every 30 minutes. Member/presence caches are intentionally
      // left at defaults — stats channels, XP and the lottery read them.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 1800, lifetime: 1800 },
      },

      // Allow pinging users and roles from bot messages, but never auto-ping the
      // person being replied to.
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false,
      },
    });

    // Wrap Discord REST calls so permission failures turn into admin alerts
    // instead of silent errors.
    installRestErrorInterceptor(this);
  }
}
