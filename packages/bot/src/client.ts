

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

      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 1800, lifetime: 1800 },
      },

      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false,
      },
    });

    installRestErrorInterceptor(this);
  }
}
