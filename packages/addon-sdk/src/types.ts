

import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonManifest } from '@arkenbot/shared';
import type { AddonContext } from './AddonContext.js';

export interface AddonCommandDefinition {
  data: SlashCommandBuilder | ContextMenuCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) => Promise<void>;
  autocomplete?: (interaction: import('discord.js').AutocompleteInteraction, ctx: AddonContext) => Promise<void>;
}

export interface AddonEventHandler<EventName extends keyof import('discord.js').ClientEvents = keyof import('discord.js').ClientEvents> {
  event: EventName;

  once?: boolean;
  handler: (ctx: AddonContext, ...args: import('discord.js').ClientEvents[EventName]) => Promise<void> | void;
}

export interface AddonLifecycleHooks {

  onLoad?: (ctx: AddonContext) => Promise<void> | void;

  onUnload?: (ctx: AddonContext) => Promise<void> | void;

  onSettingsUpdate?: (ctx: AddonContext, guildId: string, settings: Record<string, unknown>) => Promise<void> | void;

  onGuildInstall?: (ctx: AddonContext, guildId: string) => Promise<void> | void;

  onGuildUninstall?: (ctx: AddonContext, guildId: string) => Promise<void> | void;
}

export type AddonMessages = Record<string, Record<string, unknown>>;

export interface LocaleResolvable {
  user: { id: string };
  locale?: string | null;
  guildId?: string | null;
  guildLocale?: string | null;
}

export interface AddonDefinition {
  manifest: AddonManifest;
  commands?: AddonCommandDefinition[];
  events?: AddonEventHandler[];
  hooks?: AddonLifecycleHooks;

  locales?: AddonMessages;
}

export interface AddonStorage {

  get<T = unknown>(key: string, guildId?: string): Promise<T | null>;

  set<T = unknown>(key: string, value: T, guildId?: string): Promise<void>;

  mutate<T = unknown>(key: string, mutator: (current: T | null) => T | Promise<T>, guildId?: string): Promise<T>;

  delete(key: string, guildId?: string): Promise<void>;

  keys(guildId?: string): Promise<string[]>;
}

export interface AddonLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
