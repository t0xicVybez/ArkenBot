

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

export interface BotCommand {

  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder;

  category: string;

  cooldown?: number;

  ownerOnly?: boolean;

  userPermissions?: PermissionResolvable[];

  botPermissions?: PermissionResolvable[];
  execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction, client: BotClient) => Promise<void>;
  handleSelect?: (interaction: StringSelectMenuInteraction, client: BotClient) => Promise<void>;
  handleModal?: (interaction: ModalSubmitInteraction, client: BotClient) => Promise<void>;
}

export interface BotEvent {

  name: string;

  once?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (...args: any[]) => Promise<void> | void;
}
