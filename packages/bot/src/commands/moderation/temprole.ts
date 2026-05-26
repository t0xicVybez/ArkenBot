/**
 * /temprole command — assigns or removes a role from a member for a fixed
 * duration. Expiry is enforced by the BackgroundJobs temp-role checker.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { errorEmbed, successEmbed } from '../../utils/embed.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** Parses a duration string like "30m", "2h", "7d" into seconds. Returns null if invalid. */
function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[match[2].toLowerCase()] ?? 0);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Manage temporary roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Assign a role to a member temporarily')
        .addUserOption((o) => o.setName('user').setDescription('Member to assign the role to').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Role to assign').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('Duration e.g. 1h, 30m, 7d').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove an active temporary role from a member early')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Role to remove').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all active temporary roles in this server'),
    ),
  category: 'moderation',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const target = interaction.options.getMember('user');
      const role = interaction.options.getRole('role', true);
      const durationStr = interaction.options.getString('duration', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';

      if (!target || !('roles' in target)) {
        await interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found in this server.')] });
        return;
      }
      const member = target as GuildMember;

      const seconds = parseDuration(durationStr);
      if (!seconds || seconds < 60) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Duration', 'Use a format like `30m`, `2h`, `7d`. Minimum is 60 seconds.')],
        });
        return;
      }

      const expiresAt = new Date(Date.now() + seconds * 1000);

      await member.roles.add(role.id, `Temp role by ${interaction.user.tag}: ${reason}`);

      await db.tempRole.upsert({
        where: { guildId_userId_roleId: { guildId: interaction.guildId!, userId: member.id, roleId: role.id } },
        update: { removed: false, expiresAt, moderatorId: interaction.user.id, reason },
        create: {
          guildId:     interaction.guildId!,
          userId:      member.id,
          roleId:      role.id,
          moderatorId: interaction.user.id,
          reason,
          expiresAt,
        },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Temp Role Assigned',
            `${role} assigned to ${member} until <t:${Math.floor(expiresAt.getTime() / 1000)}:F>.\n**Reason:** ${reason}`,
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      const target = interaction.options.getMember('user');
      const role = interaction.options.getRole('role', true);

      if (!target || !('roles' in target)) {
        await interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found in this server.')] });
        return;
      }
      const member = target as GuildMember;

      const record = await db.tempRole.findUnique({
        where: { guildId_userId_roleId: { guildId: interaction.guildId!, userId: member.id, roleId: role.id } },
      });

      if (!record || record.removed) {
        await interaction.editReply({ embeds: [errorEmbed('Not Found', 'No active temp role record found for that member and role.')] });
        return;
      }

      await member.roles.remove(role.id, `Temp role removed early by ${interaction.user.tag}`).catch(() => null);
      await db.tempRole.update({ where: { id: record.id }, data: { removed: true } });

      await interaction.editReply({ embeds: [successEmbed('Temp Role Removed', `${role} removed from ${member}.`)] });
      return;
    }

    if (sub === 'list') {
      const records = await db.tempRole.findMany({
        where:   { guildId: interaction.guildId!, removed: false },
        orderBy: { expiresAt: 'asc' },
        take:    25,
      });

      if (records.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('No Active Temp Roles', 'There are no active temporary roles in this server.')] });
        return;
      }

      const lines: string[] = records.map(
        (r: { userId: string; roleId: string; expiresAt: Date }) =>
          `<@${r.userId}> → <@&${r.roleId}> — expires <t:${Math.floor(new Date(r.expiresAt).getTime() / 1000)}:R>`,
      );

      const embed = new EmbedBuilder()
        .setTitle('Active Temporary Roles')
        .setDescription(lines.join('\n'))
        .setColor(0x5865f2);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
