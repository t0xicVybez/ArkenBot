/**
 * Shared type definitions for commands and events consumed by the handler layer.
 */

import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  AutocompleteInteraction,
  PermissionResolvable,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import type { BotClient } from './client.js';

/**
 * Describes a single slash command or context-menu command module.
 *
 * The optional `handleButton`, `handleSelect`, and `handleModal` handlers use a
 * `customId` prefix convention — the first segment before `:` must match the
 * command name so the InteractionHandler can route the interaction without a
 * separate registry.
 */
export interface BotCommand {
  /** Discord API builder that defines the command's name, description, and options. */
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder;
  /** Logical grouping used by the help system and the staff portal. */
  category: string;
  /** Per-user cooldown in seconds. Defaults to 3 s when omitted. */
  cooldown?: number;
  /** When true, only users listed in `config.owners` may invoke this command. */
  ownerOnly?: boolean;
  /** Discord permissions the invoking member must hold. */
  userPermissions?: PermissionResolvable[];
  /** Discord permissions the bot itself must hold to execute the command. */
  botPermissions?: PermissionResolvable[];
  execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction, client: BotClient) => Promise<void>;
  handleSelect?: (interaction: StringSelectMenuInteraction, client: BotClient) => Promise<void>;
  handleModal?: (interaction: ModalSubmitInteraction, client: BotClient) => Promise<void>;
}

/** Describes a discord.js gateway event listener module. */
export interface BotEvent {
  /** The discord.js event name (e.g. `'messageCreate'`). */
  name: string;
  /** When true, the listener is registered with `client.once` instead of `client.on`. */
  once?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (...args: any[]) => Promise<void> | void;
}
