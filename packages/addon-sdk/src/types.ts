/**
 * Core type definitions for the addon SDK.
 * These interfaces form the contract between addons and the bot runtime.
 */

import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonManifest } from '@arkenbot/shared';
import type { AddonContext } from './AddonContext.js';

/**
 * A slash command or context-menu command registered by an addon.
 * The `execute` function receives the interaction and the addon's context object.
 */
export interface AddonCommandDefinition {
  data: SlashCommandBuilder | ContextMenuCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) => Promise<void>;
  autocomplete?: (interaction: import('discord.js').AutocompleteInteraction, ctx: AddonContext) => Promise<void>;
}

/**
 * A Discord gateway event handler registered by an addon.
 * `event` must be a valid key of `discord.js` `ClientEvents`.
 */
export interface AddonEventHandler<EventName extends keyof import('discord.js').ClientEvents = keyof import('discord.js').ClientEvents> {
  event: EventName;
  /** When `true`, the handler is unregistered after firing once. */
  once?: boolean;
  handler: (ctx: AddonContext, ...args: import('discord.js').ClientEvents[EventName]) => Promise<void> | void;
}

/** Lifecycle hooks called by the runtime at key points in an addon's lifespan. */
export interface AddonLifecycleHooks {
  /** Called once when the addon is loaded at startup or after a hot-reload. */
  onLoad?: (ctx: AddonContext) => Promise<void> | void;
  /** Called when the addon is disabled or the process is shutting down. */
  onUnload?: (ctx: AddonContext) => Promise<void> | void;
  /** Called whenever a guild administrator saves new settings for this addon. */
  onSettingsUpdate?: (ctx: AddonContext, guildId: string, settings: Record<string, unknown>) => Promise<void> | void;
  /** Called when a guild installs this addon for the first time. */
  onGuildInstall?: (ctx: AddonContext, guildId: string) => Promise<void> | void;
  /** Called when a guild removes this addon. */
  onGuildUninstall?: (ctx: AddonContext, guildId: string) => Promise<void> | void;
}

/**
 * Localized message catalogs for an addon, keyed by locale code (e.g. `en-US`,
 * `fr`). Each catalog is a nested object of dot-addressable string keys, mirroring
 * the core bot's i18n format. `en-US` is the base/fallback catalog. Consumed via
 * `ctx.t(key, locale, vars)`.
 */
export type AddonMessages = Record<string, Record<string, unknown>>;

/**
 * The minimal shape needed to resolve which language to reply in. A discord.js
 * `ChatInputCommandInteraction`/`ContextMenuCommandInteraction` already satisfies
 * it; event handlers can pass `{ user: { id: '' }, guildId, guildLocale }`.
 */
export interface LocaleResolvable {
  user: { id: string };
  locale?: string | null;
  guildId?: string | null;
  guildLocale?: string | null;
}

/**
 * The complete definition of an addon passed to `defineAddon()`.
 * The `manifest` is required; all other fields are optional.
 */
export interface AddonDefinition {
  manifest: AddonManifest;
  commands?: AddonCommandDefinition[];
  events?: AddonEventHandler[];
  hooks?: AddonLifecycleHooks;
  /**
   * Localized message catalogs for this addon's user-facing output. When provided,
   * `ctx.t(key, locale, vars)` resolves against them (falling back to `en-US`, then
   * the key). Pair with `ctx.resolveLocale(interaction)` to pick the viewer's language.
   */
  locales?: AddonMessages;
}

/**
 * Key-value persistence interface provided to each addon by the runtime.
 * Data is automatically namespaced by addon name and optionally by guild ID.
 */
export interface AddonStorage {
  /** Retrieves a value. Scoped to `guildId` when provided. */
  get<T = unknown>(key: string, guildId?: string): Promise<T | null>;
  /** Persists a value. Scoped to `guildId` when provided. */
  set<T = unknown>(key: string, value: T, guildId?: string): Promise<void>;
  /** Deletes a value. Scoped to `guildId` when provided. */
  delete(key: string, guildId?: string): Promise<void>;
  /** Lists all keys in the given scope. */
  keys(guildId?: string): Promise<string[]>;
}

/** Structured logger provided to each addon. Output is tagged with the addon name. */
export interface AddonLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
