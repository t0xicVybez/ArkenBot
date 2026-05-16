/**
 * /leveling command — administrative controls for the leveling system, including
 * XP multiplier configuration, role-stacking behaviour, and bulk role sync.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { LevelingModule } from '../../modules/leveling/LevelingModule.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: (new SlashCommandBuilder()
    .setName('leveling')
    .setDescription('Leveling system admin settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) =>
      s
        .setName('multiplier')
        .setDescription('Set the XP multiplier for this server (e.g. 2.0 = double XP)')
        .addNumberOption((o) =>
          o
            .setName('value')
            .setDescription('Multiplier value between 0.1 and 10.0 (default: 1.0)')
            .setRequired(true)
            .setMinValue(0.1)
            .setMaxValue(10),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName('sync-roles')
        .setDescription('Bulk-assign level roles to all members based on their current level'),
    )

    .addSubcommand((s) =>
      s
        .setName('keep-roles')
        .setDescription('Toggle whether members keep previous level roles when they earn a higher one')
        .addBooleanOption((o) =>
          o
            .setName('enabled')
            .setDescription('true = stack all earned roles, false = only keep the highest role')
            .setRequired(true),
        ),
    )
  ) as unknown as SlashCommandBuilder,
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'multiplier') {
      const value = interaction.options.getNumber('value', true);

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guild.id },
        update: { xpMultiplier: value },
        create: { guildId: interaction.guild.id, xpMultiplier: value },
      });

      await interaction.reply({
        content: `XP multiplier set to **${value}x**. Members will now earn ${value === 1 ? 'normal' : `${value}x the`} XP per message.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'keep-roles') {
      const enabled = interaction.options.getBoolean('enabled', true);

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guild.id },
        update: { keepPreviousRoles: enabled },
        create: { guildId: interaction.guild.id, keepPreviousRoles: enabled },
      });

      await interaction.reply({
        content: enabled
          ? 'Members will now **keep all previous level roles** when they earn a higher one.'
          : 'Members will now **only keep their highest level role** (lower roles removed automatically).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'sync-roles') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await getGuildSettings(interaction.guild.id);
      const keepPreviousRoles = settings?.keepPreviousRoles ?? false;

      const { processed, updated } = await LevelingModule.syncAllRoles(
        interaction.guild,
        keepPreviousRoles,
      );

      await interaction.editReply(
        `Role sync complete. Processed **${processed}** members, updated roles for **${updated}**.`,
      );
    }
  },
};

export default command;
