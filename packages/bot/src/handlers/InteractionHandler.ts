/**
 * The central router for every Discord interaction.
 *
 * Whenever a user runs a slash command, types in an autocomplete field, clicks
 * a button, picks from a select menu, or submits a modal, that interaction
 * lands here first. We figure out what kind it is and send it to the right
 * place.
 *
 * Buttons, selects and modals are routed by the first `:`-separated segment of
 * their `customId`, which is the owning command's name (e.g. `giveaway:enter`
 * → the `giveaway` command's `handleButton`). A few cross-cutting flows that
 * aren't owned by a single command (verification, appeals, RSVPs, the ban
 * network) are matched by a `prefix:` instead.
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
import { logger, swallow} from '../logger.js';
import { isAddonEnabledForGuild } from '../utils/settings.js';
import { ADDON_CATEGORY_PREFIX, classifyError } from '@arkenbot/shared';
import { captureError } from '../sentry.js';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { VerificationModule } from '../modules/verification/VerificationModule.js';
import { AppealsModule } from '../modules/moderation/AppealsModule.js';
import { EventsModule } from '../modules/events/EventsModule.js';

export class InteractionHandler {
  private client: BotClient;

  constructor(client: BotClient) {
    this.client = client;
  }

  /** Entry point: send each interaction to the handler for its type. */
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
      // Right-click (context-menu) commands share the slash-command handler.
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

    // If this command comes from an addon, make sure that addon is actually
    // installed for the server before running it.
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

    // Server admins can switch individual commands off; respect that.
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

    // Per-role command permissions. Administrators always bypass these. The
    // rule is: a matching deny always blocks; and if any allow-rules exist for
    // the command, the member must hold at least one allowed role.
    if (interaction.guildId) {
      const rolePerms = await prisma.commandRolePermission.findMany({
        where: { guildId: interaction.guildId, commandName: command.data.name },
        select: { roleId: true, allow: true },
      });
      if (rolePerms.length > 0) {
        const member = await interaction.guild?.members.fetch(interaction.user.id).catch(swallow);

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

    // Rate-limit repeated use (default 3s) so commands can't be spammed.
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

    // Enforce any Discord permissions the command requires of the caller.
    if (command.userPermissions && interaction.guild) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(swallow);
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

    // All checks passed — run the command, and turn any failure into a friendly
    // message rather than a silent crash.
    try {
      await command.execute(interaction, this.client);
    } catch (err) {
      // classifyError sorts the failure into a category so we react sensibly:
      // expired-interaction errors are ignored, truly unknown ones are reported
      // to Sentry, and the rest show a helpful summary/hint to the user.
      const classified = classifyError(err);
      logger.error(
        { err, command: command.data.name, category: classified.category, code: classified.code },
        `Command execution error — ${classified.summary}`,
      );

      if (classified.category === 'interaction') return;

      if (classified.category === 'unknown') {
        captureError(err, { command: command.data.name, guildId: interaction.guildId ?? undefined });
      }

      const description =
        classified.category === 'unknown'
          ? 'An error occurred while executing this command.'
          : `${classified.summary}${classified.hint ? `\n\n*${classified.hint}*` : ''}`;
      const embed = errorEmbed('Error', description);

      // Reply or edit depending on whether we've already responded.
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed] }).catch(swallow);
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(swallow);
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

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    // Cross-cutting flows not owned by a single command, matched by prefix.
    if (interaction.customId.startsWith('verify:')) {
      try {
        await VerificationModule.handleVerifyButton(interaction);
      } catch (err) {
        logger.error({ err }, 'Verification button error');
      }
      return;
    }

    if (interaction.customId.startsWith('event:rsvp:')) {
      try {
        await EventsModule.handleRsvp(interaction);
      } catch (err) {
        logger.error({ err }, 'Event RSVP error');
      }
      return;
    }

    if (interaction.customId.startsWith('bannet:')) {
      try {
        const { BanNetworkModule } = await import('../modules/moderation/BanNetworkModule.js');
        await BanNetworkModule.handleButton(interaction, interaction.client);
      } catch (err) {
        logger.error({ err }, 'Ban network button error');
      }
      return;
    }

    if (interaction.customId.startsWith('appeal:')) {
      const [, sub] = interaction.customId.split(':');
      try {
        if (sub === 'start') await AppealsModule.handleStart(interaction);
        else await AppealsModule.handleReview(this.client, interaction);
      } catch (err) {
        logger.error({ err }, 'Appeal button error');
      }
      return;
    }

    // Default: route to the command named by the customId's first segment.
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

  private async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    // Select menus route to their owning command by customId prefix.
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

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    // Appeal modals are a cross-cutting flow; everything else routes by prefix.
    if (interaction.customId.startsWith('appeal:modal:')) {
      try {
        await AppealsModule.handleModal(this.client, interaction);
      } catch (err) {
        logger.error({ err }, 'Appeal modal error');
      }
      return;
    }

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
   * Returns the seconds left on a user's cooldown for a command, or 0 if they're
   * clear. Backed by a Redis key that expires on its own, so the cooldown is
   * shared across every bot process and needs no cleanup.
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
