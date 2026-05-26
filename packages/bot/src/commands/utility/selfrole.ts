import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';

export const CACHE_KEY = (guildId: string) => `sr:list:${guildId}`;
const CACHE_TTL = 120;

type SelfRoleRow = { id: string; roleId: string; name: string };

export async function getSelfRoles(guildId: string): Promise<SelfRoleRow[]> {
  const raw = await redis.get(CACHE_KEY(guildId));
  if (raw === 'null') return [];
  if (raw) return JSON.parse(raw) as SelfRoleRow[];

  const rows = await prisma.selfRole.findMany({
    where: { guildId },
    select: { id: true, roleId: true, name: true },
    orderBy: { name: 'asc' },
  });

  await redis.setex(CACHE_KEY(guildId), CACHE_TTL, rows.length ? JSON.stringify(rows) : 'null');
  return rows;
}

export async function bustSelfRoleCache(guildId: string) {
  await redis.del(CACHE_KEY(guildId));
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('selfrole')
    .setDescription('Manage self-assignable roles for this server')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a role to the self-assignable list (requires Manage Roles)')
        .addRoleOption((o) =>
          o.setName('role').setDescription('The role to make self-assignable').setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('Short name users type to claim it (e.g. fighter). Defaults to the role name.')
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a role from the self-assignable list (requires Manage Roles)')
        .addStringOption((o) =>
          o.setName('name').setDescription('Name of the role to remove').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all self-assignable roles in this server')
    ) as unknown as SlashCommandBuilder,

  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add' || sub === 'remove') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ content: '❌ You need **Manage Roles** permission to use this.', ephemeral: true });
        return;
      }
    }

    // add ──────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const role    = interaction.options.getRole('role', true);
      const rawName = interaction.options.getString('name') ?? role.name;
      const name    = rawName.toLowerCase().trim();

      const botMember = interaction.guild?.members.me;
      if (botMember && role.position >= botMember.roles.highest.position) {
        await interaction.reply({
          content: `❌ The bot's role is below **${role.name}** in the role list. Move the bot's role above it first.`,
          ephemeral: true,
        });
        return;
      }

      try {
        await prisma.selfRole.create({ data: { guildId, roleId: role.id, name } });
        await bustSelfRoleCache(guildId);
        await interaction.reply({
          content: `✅ <@&${role.id}> is now self-assignable as \`${name}\`.\nMembers can run \`/selfassignrole ${name}\` to claim it.`,
          ephemeral: true,
        });
      } catch {
        await interaction.reply({
          content: `❌ A self-assignable role with that name or role already exists. Use \`/selfrole list\` to see current entries.`,
          ephemeral: true,
        });
      }
      return;
    }

    // remove ───────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const name    = interaction.options.getString('name', true).toLowerCase();
      const deleted = await prisma.selfRole.deleteMany({ where: { guildId, name } });

      if (!deleted.count) {
        await interaction.reply({ content: `❌ No self-assignable role named \`${name}\` found.`, ephemeral: true });
        return;
      }

      await bustSelfRoleCache(guildId);
      await interaction.reply({ content: `✅ \`${name}\` removed from the self-assignable list.`, ephemeral: true });
      return;
    }

    // list ─────────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const roles = await getSelfRoles(guildId);

      if (!roles.length) {
        await interaction.reply({
          content: 'No self-assignable roles configured yet. Admins can add roles with `/selfrole add`.',
          ephemeral: true,
        });
        return;
      }

      const lines = roles.map((r) => {
        const discordRole = interaction.guild?.roles.cache.get(r.roleId);
        return discordRole
          ? `\`${r.name}\` → <@&${r.roleId}>`
          : `\`${r.name}\` → ~~${r.roleId}~~ *(role deleted)*`;
      });

      const embed = new EmbedBuilder()
        .setTitle('Self-Assignable Roles')
        .setColor(0x5865f2)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Use /selfassignrole <name> to claim · /selfremoverole <name> to drop' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const roles   = await getSelfRoles(interaction.guildId!);
    const matches = roles
      .filter((r) => r.name.includes(focused))
      .slice(0, 25)
      .map((r) => ({ name: r.name, value: r.name }));
    await interaction.respond(matches);
  },
};

export default command;
