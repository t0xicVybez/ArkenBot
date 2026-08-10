/**
 * /autoresponse command — manage regex-triggered auto-responses for the guild.
 * Patterns are compiled at message-time; this command validates the regex before
 * saving and invalidates the Redis cache so changes take effect within seconds.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { errorEmbed, successEmbed } from '../../utils/embed.js';

import { swallow } from '../../logger.js';
/** Invalidates the guild's cached auto-response list so the next message picks up the change. */
async function bustCache(guildId: string): Promise<void> {
  await redis.del(`ar:list:${guildId}`).catch(swallow);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('autoresponse')
    .setDescription('Manage regex-triggered auto-responses')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a new auto-response')
        .addStringOption((o) => o.setName('pattern').setDescription('Regex pattern (no delimiters), e.g. \\bhello\\b').setRequired(true))
        .addStringOption((o) => o.setName('response').setDescription('Response text').setRequired(true))
        .addStringOption((o) => o.setName('flags').setDescription('Regex flags (default: i)').setRequired(false))
        .addBooleanOption((o) => o.setName('embed').setDescription('Send response as an embed').setRequired(false))
        .addStringOption((o) => o.setName('embed_color').setDescription('Embed color hex e.g. #5865F2').setRequired(false))
        .addBooleanOption((o) => o.setName('delete_message').setDescription('Delete the triggering message').setRequired(false)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove an auto-response by ID')
        .addStringOption((o) => o.setName('id').setDescription('Auto-response ID (from /autoresponse list)').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription('Enable or disable an auto-response')
        .addStringOption((o) => o.setName('id').setDescription('Auto-response ID').setRequired(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('true to enable, false to disable').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all auto-responses for this server'),
    ),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const pattern     = interaction.options.getString('pattern', true);
      const response    = interaction.options.getString('response', true);
      const flags       = interaction.options.getString('flags') ?? 'i';
      const embed       = interaction.options.getBoolean('embed') ?? false;
      const embedColor  = interaction.options.getString('embed_color');
      const deleteMsg   = interaction.options.getBoolean('delete_message') ?? false;

      // Validate regex before persisting — catches catastrophic patterns early.
      try {
        new RegExp(pattern, flags);
      } catch {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Regex', `The pattern \`${pattern}\` with flags \`${flags}\` is not valid.`)],
        });
        return;
      }

      const row = await prisma.autoResponse.create({
        data: {
          guildId:       interaction.guildId!,
          pattern,
          flags,
          response,
          embed,
          embedColor:    embedColor ?? null,
          deleteMessage: deleteMsg,
          createdById:   interaction.user.id,
        },
      });

      await bustCache(interaction.guildId!);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Auto-Response Added',
            `**ID:** \`${row.id}\`\n**Pattern:** \`${pattern}\` (flags: \`${flags}\`)\n**Response:** ${response}`,
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id', true);

      const row = await prisma.autoResponse.findUnique({ where: { id } });
      if (!row || row.guildId !== interaction.guildId) {
        await interaction.editReply({ embeds: [errorEmbed('Not Found', 'No auto-response found with that ID in this server.')] });
        return;
      }

      await prisma.autoResponse.delete({ where: { id } });
      await bustCache(interaction.guildId!);

      await interaction.editReply({ embeds: [successEmbed('Auto-Response Removed', `Pattern \`${row.pattern}\` deleted.`)] });
      return;
    }

    if (sub === 'toggle') {
      const id      = interaction.options.getString('id', true);
      const enabled = interaction.options.getBoolean('enabled', true);

      const row = await prisma.autoResponse.findUnique({ where: { id } });
      if (!row || row.guildId !== interaction.guildId) {
        await interaction.editReply({ embeds: [errorEmbed('Not Found', 'No auto-response found with that ID in this server.')] });
        return;
      }

      await prisma.autoResponse.update({ where: { id }, data: { enabled } });
      await bustCache(interaction.guildId!);

      await interaction.editReply({
        embeds: [successEmbed('Auto-Response Updated', `Pattern \`${row.pattern}\` is now **${enabled ? 'enabled' : 'disabled'}**.`)],
      });
      return;
    }

    if (sub === 'list') {
      const rows = await prisma.autoResponse.findMany({
        where:   { guildId: interaction.guildId! },
        orderBy: { createdAt: 'asc' },
        take:    25,
      });

      if (rows.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed('No Auto-Responses', 'No auto-responses configured for this server.')] });
        return;
      }

      const lines = rows.map((r) => {
        const status = r.enabled ? '🟢' : '🔴';
        return `${status} \`${r.id.slice(0, 8)}\` | \`${r.pattern}\` → ${r.response.length > 40 ? r.response.slice(0, 40) + '…' : r.response}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('Auto-Responses')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Use the full ID from this list with /autoresponse remove or toggle' })
        .setColor(0x5865f2);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
