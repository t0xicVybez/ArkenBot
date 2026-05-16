/**
 * /help command — generates a paginated, permission-aware command reference for
 * the invoking member. Pages are built at runtime so disabled commands, addon
 * commands, and role-restricted commands are correctly filtered per guild.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS, ADDON_CATEGORY_PREFIX } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { isAddonEnabledForGuild } from '../../utils/settings.js';

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  moderation: { emoji: '🛡️', label: 'Moderation' },
  leveling:   { emoji: '📈', label: 'Leveling'   },
  community:  { emoji: '🌐', label: 'Community'  },
  music:      { emoji: '🎵', label: 'Music'       },
  utility:    { emoji: '🔧', label: 'Utility'     },
};

interface CmdOption { type: number; name: string; description: string; options?: CmdOption[] }
interface CmdJSON   { name: string; description: string; options?: CmdOption[] }

// Discord option type constants — used to detect subcommands when building per-category pages.
const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

/**
 * Returns display metadata (emoji and label) for a command category string.
 * Addon categories (prefixed with `addon:`) receive a generic puzzle-piece emoji
 * and a title-cased label derived from the addon name.
 */
function getCategoryMeta(cat: string): { emoji: string; label: string } {
  if (CATEGORY_META[cat]) return CATEGORY_META[cat]!;
  const label = cat.replace(/^addon:/i, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { emoji: '🧩', label };
}

/**
 * Builds the paginated help embed list for a guild member.
 * Filters commands by guild-level disables, owner-only flags, required Discord
 * permissions, addon enablement, and role-based permission rules.
 *
 * @param client  - The active bot client, used to iterate registered commands.
 * @param member  - The guild member requesting help, or null in DMs.
 * @param guildId - The guild ID for permission lookups, or null in DMs.
 */
async function buildPages(
  client: BotClient,
  member: GuildMember | null,
  guildId: string | null,
): Promise<EmbedBuilder[]> {
  const [disabledRows, rolePerms] = await Promise.all([
    guildId ? prisma.disabledCommand.findMany({ where: { guildId }, select: { commandName: true } }) : Promise.resolve([]),
    guildId ? prisma.commandRolePermission.findMany({ where: { guildId }, select: { commandName: true, roleId: true, allow: true } }) : Promise.resolve([]),
  ]);
  const disabledSet = new Set(disabledRows.map((r) => r.commandName));
  const memberRoleIds = member ? [...member.roles.cache.keys()] : [];

  const grouped = new Map<string, BotCommand[]>();
  for (const cmd of client.commands.values()) {
    const name = (cmd.data as { name: string }).name;

    if (disabledSet.has(name)) continue;

    if (cmd.ownerOnly && member) {
      const ownerIds = (await import('../../config.js')).config.owners;
      if (!ownerIds.includes(member.id)) continue;
    }

    if (cmd.userPermissions && member) {
      const missing = cmd.userPermissions.filter((p) => !member.permissions.has(p));
      if (missing.length > 0) continue;
    }

    if (guildId && cmd.category?.startsWith(ADDON_CATEGORY_PREFIX)) {
      const addonName = cmd.category.slice(ADDON_CATEGORY_PREFIX.length);
      const enabled = await isAddonEnabledForGuild(addonName, guildId);
      if (!enabled) continue;
    }

    // Administrators bypass all role-based command restrictions.
    if (!member?.permissions.has('Administrator')) {
      const cmdRolePerms = rolePerms.filter((p) => p.commandName === name);
      if (cmdRolePerms.length > 0) {
        const applicable = cmdRolePerms.filter((p) => memberRoleIds.includes(p.roleId));
        const isDenied = applicable.some((p) => !p.allow);
        const allowRulesExist = cmdRolePerms.some((p) => p.allow);
        const hasAllowedRole = applicable.some((p) => p.allow);
        if (isDenied || (allowRulesExist && !hasAllowedRole)) continue;
      }
    }

    const cat = (cmd.category ?? 'utility').toLowerCase();
    const list = grouped.get(cat) ?? [];
    list.push(cmd);
    grouped.set(cat, list);
  }

  const order = Object.keys(CATEGORY_META);
  const sortedCats = [...grouped.keys()].sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const totalCmds = [...grouped.values()].reduce((sum, v) => sum + v.length, 0);
  const botName   = client.user?.username ?? 'Arken Bot';
  const botAvatar = client.user?.displayAvatarURL() ?? undefined;

  const pages: EmbedBuilder[] = [];

  const overview = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setAuthor({ name: botName, iconURL: botAvatar })
    .setTitle('📋 Command Reference')
    .setDescription(
      `**${totalCmds} commands** available to you across **${sortedCats.length} categories**.\n` +
      `Use ◀ ▶ to browse, or click **Overview** to return here.\n​`,
    );

  for (const cat of sortedCats) {
    const cmds = grouped.get(cat)!;
    const meta = getCategoryMeta(cat);
    const names = cmds
      .map((c) => `\`/${(c.data as { name: string }).name}\``)
      .sort()
      .join('  ');
    overview.addFields({ name: `${meta.emoji} ${meta.label}  ·  ${cmds.length} cmd${cmds.length !== 1 ? 's' : ''}`, value: names, inline: false });
  }

  pages.push(overview);

  for (const cat of sortedCats) {
    const cmds = grouped.get(cat)!.sort((a, b) => {
      const an = (a.data as { name: string }).name;
      const bn = (b.data as { name: string }).name;
      return an.localeCompare(bn);
    });
    const meta = getCategoryMeta(cat);

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setAuthor({ name: botName, iconURL: botAvatar })
      .setTitle(`${meta.emoji} ${meta.label}`);

    for (const cmd of cmds) {
      const json = (cmd.data as { toJSON(): CmdJSON }).toJSON();
      const subs = (json.options ?? []).filter(
        (o) => o.type === SUB_COMMAND || o.type === SUB_COMMAND_GROUP,
      );

      let value = json.description;
      if (subs.length > 0) {
        value += '\n> ' + subs.map((s) => `\`${s.name}\``).join('  ');
      }

      embed.addFields({ name: `/${json.name}`, value, inline: false });
    }

    pages.push(embed);
  }

  pages.forEach((p, i) =>
    p.setFooter({ text: `Page ${i + 1} of ${pages.length}  ·  ${totalCmds} commands available to you` }),
  );

  return pages;
}

/**
 * Constructs the navigation button row for the help paginator.
 * Previous and next buttons are disabled at the boundary pages.
 */
function makeRow(page: number, total: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setEmoji('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('help_home')
      .setLabel('Overview')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setEmoji('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === total - 1),
  );
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse commands available to you'),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;

    const pages = await buildPages(client, member, interaction.guildId);
    let page = 0;

    const msg = await interaction.editReply({
      embeds:     [pages[0]!],
      components: [makeRow(0, pages.length)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: 'This menu belongs to someone else.', ephemeral: true });
        return;
      }
      if (i.customId === 'help_prev') page = Math.max(0, page - 1);
      else if (i.customId === 'help_next') page = Math.min(pages.length - 1, page + 1);
      else if (i.customId === 'help_home') page = 0;
      await i.update({ embeds: [pages[page]!], components: [makeRow(page, pages.length)] });
    });

    collector.on('end', async () => {
      const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('help_prev').setEmoji('◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('help_home').setLabel('Overview').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('help_next').setEmoji('▶').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await interaction.editReply({ components: [disabled] }).catch(() => null);
    });
  },
};

export default command;
