/**
 * Shared shapes for the two things the bot loads from disk: commands and events.
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
 * A slash (or context-menu) command. Every file in `commands/<category>/`
 * default-exports one of these. `execute` runs the command; the optional
 * handlers receive the follow-up interactions (buttons, selects, modals,
 * autocomplete) whose customId starts with this command's name.
 */
export interface BotCommand {
  // The command definition Discord registers (name, options, description).
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder;

  // Which category folder it came from (also used to tag addon commands).
  category: string;

  // Minimum seconds between uses per user (defaults to 3 if omitted).
  cooldown?: number;

  // Restrict to bot owners.
  ownerOnly?: boolean;

  // Discord permissions the caller must have.
  userPermissions?: PermissionResolvable[];

  // Discord permissions the bot needs to carry the command out.
  botPermissions?: PermissionResolvable[];
  execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction, client: BotClient) => Promise<void>;
  handleSelect?: (interaction: StringSelectMenuInteraction, client: BotClient) => Promise<void>;
  handleModal?: (interaction: ModalSubmitInteraction, client: BotClient) => Promise<void>;
}

/**
 * A gateway event listener. Every file in `events/` default-exports one.
 */
export interface BotEvent {
  // The discord.js event name to listen for.
  name: string;

  // Fire only the first time the event occurs (e.g. `clientReady`).
  once?: boolean;
  // Event payloads differ per event, so the args are intentionally loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (...args: any[]) => Promise<void> | void;
}
