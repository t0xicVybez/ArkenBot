/**
 * Routes incoming Discord interactions to the appropriate command handler.
 * Enforces addon availability, per-guild command disables, role-based permission
 * rules, per-user cooldowns, and required member permissions before delegating
 * to the command's execute function.
 */

import {
  MessageFlags,
  type Interaction,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { BotClient } from '../client.js';
import { errorEmbed } from '../utils/embed.js';
import { logger } from '../logger.js';
import { isAddonEnabledForGuild } from '../utils/settings.js';
import { ADDON_CATEGORY_PREFIX } from '@arkenbot/shared';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { VerificationModule } from '../modules/verification/VerificationModule.js';

/** Routes and pre-validates all incoming Discord interactions before command execution. */
export class InteractionHandler {
  private client: BotClient;

  constructor(client: BotClient) {
    this.client = client;
  }

  /**
   * Dispatches an interaction to the appropriate typed handler. Context-menu
   * commands are treated as chat input interactions for routing purposes.
   */
  async handle(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      await this.handleChatCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction);
    } else if (interaction.isButton()) {
      await this.handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await this.handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await this.handleModal(interaction);
    } else if (interaction.isContextMenuCommand()) {
      await this.handleChatCommand(interaction as unknown as ChatInputCommandInteraction);
    }
  }

  private async handleChatCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed('Unknown Command', 'This command does not exist.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Addon commands are gated by per-guild addon enable state.
    if (command.category?.startsWith(ADDON_CATEGORY_PREFIX) && interaction.guildId) {
      const addonName = command.category.slice(ADDON_CATEGORY_PREFIX.length);
      const enabled = await isAddonEnabledForGuild(addonName, interaction.guildId);
      if (!enabled) {
        await interaction.reply({
          embeds: [errorEmbed('Addon Not Enabled', 'This addon is not installed for this server.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    if (interaction.guildId) {
      const disabled = await prisma.disabledCommand.findFirst({
        where: { guildId: interaction.guildId, commandName: command.data.name },
        select: { id: true },
      });
      if (disabled) {
        await interaction.reply({
          embeds: [errorEmbed('Command Disabled', `The \`/${command.data.name}\` command has been disabled in this server.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Role-based permission rules: when no rules exist for a command the check
    // is skipped entirely (allow-all default). Administrators bypass all rules.
    // Deny entries take precedence over allow entries. When allow rules exist,
    // the user must hold at least one allowed role (whitelist mode).
    if (interaction.guildId) {
      const rolePerms = await prisma.commandRolePermission.findMany({
        where: { guildId: interaction.guildId, commandName: command.data.name },
        select: { roleId: true, allow: true },
      });
      if (rolePerms.length > 0) {
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);

        if (!member?.permissions.has('Administrator')) {
          const memberRoleIds = member ? [...member.roles.cache.keys()] : [];
          const applicable = rolePerms.filter((p) => memberRoleIds.includes(p.roleId));

          const isDenied = applicable.some((p) => !p.allow);
          const allowRulesExist = rolePerms.some((p) => p.allow);
          const hasAllowedRole = applicable.some((p) => p.allow);

          if (isDenied || (allowRulesExist && !hasAllowedRole)) {
            await interaction.reply({
              embeds: [errorEmbed('Not Permitted', `You do not have permission to use \`/${command.data.name}\` in this server.`)],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }
      }
    }

    const inCooldown = await this.checkCooldown(interaction, command.data.name, command.cooldown ?? 3);
    if (inCooldown > 0) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Cooldown',
            `Please wait **${inCooldown.toFixed(1)}s** before using \`/${command.data.name}\` again.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (command.userPermissions && interaction.guild) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) {
        const missing = command.userPermissions.filter(
          (p) => !member.permissions.has(p)
        );
        if (missing.length > 0) {
          await interaction.reply({
            embeds: [
              errorEmbed(
                'Missing Permissions',
                `You need the following permissions: ${missing.join(', ')}`
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }
    }

    try {
      await command.execute(interaction, this.client);
    } catch (err) {
      logger.error({ err, command: command.data.name }, 'Command execution error');
      const embed = errorEmbed('Error', 'An error occurred while executing this command.');

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed] }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction, this.client);
    } catch (err) {
      logger.error({ err }, 'Autocomplete error');
    }
  }

  /**
   * Routes button interactions using a `commandName:...` customId convention
   * so each command owns its own button handling logic.
   *
   * Special cases:
   *   - `verify:*`  → VerificationModule.handleVerifyButton
   */
  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    // Verification gate buttons
    if (interaction.customId.startsWith('verify:')) {
      try {
        await VerificationModule.handleVerifyButton(interaction);
      } catch (err) {
        logger.error({ err }, 'Verification button error');
      }
      return;
    }

    const [commandName] = interaction.customId.split(':');
    const command = this.client.commands.get(commandName);

    if (command?.handleButton) {
      try {
        await command.handleButton(interaction, this.client);
      } catch (err) {
        logger.error({ err }, 'Button handler error');
      }
    }
  }

  /**
   * Routes select-menu interactions using a `commandName:...` customId convention.
   */
  private async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    const [commandName] = interaction.customId.split(':');
    const command = this.client.commands.get(commandName);

    if (command?.handleSelect) {
      try {
        await command.handleSelect(interaction, this.client);
      } catch (err) {
        logger.error({ err }, 'Select menu handler error');
      }
    }
  }

  /**
   * Routes modal-submit interactions using a `commandName:...` customId convention.
   */
  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const [commandName] = interaction.customId.split(':');
    const command = this.client.commands.get(commandName);

    if (command?.handleModal) {
      try {
        await command.handleModal(interaction, this.client);
      } catch (err) {
        logger.error({ err }, 'Modal handler error');
      }
    }
  }

  /**
   * Checks and sets a per-user, per-command cooldown in Redis.
   *
   * @returns Remaining cooldown in seconds (0 when the user is not on cooldown).
   *
   * `pttl` returns -2 when the key does not exist and -1 when the key has no
   * expiry; both values are treated as "no active cooldown".
   */
  private async checkCooldown(
    interaction: ChatInputCommandInteraction,
    commandName: string,
    seconds: number,
  ): Promise<number> {
    const key = `cooldown:${commandName}:${interaction.user.id}`;
    const ttl = await redis.pttl(key);
    if (ttl > 0) return ttl / 1000;
    await redis.set(key, '1', 'EX', seconds);
    return 0;
  }
}
