/**
 * /valorant — link a Riot account (token-based RSO start, no dashboard login),
 * show a VALORANT rank, or unlink. No-ops with a friendly message while the
 * integration is unconfigured.
 */
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, type ChatInputCommandInteraction,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { config } from '../../config.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { tierName, tierColor } from '../../modules/valorant/constants.js';

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.arkenbot.app';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('valorant')
    .setDescription('VALORANT rank & account linking')
    .addSubcommand((s) => s.setName('link').setDescription('Link your Riot account'))
    .addSubcommand((s) => s.setName('unlink').setDescription('Unlink your Riot account'))
    .addSubcommand((s) => s.setName('rank').setDescription('Show a VALORANT rank')
      .addUserOption((o) => o.setName('user').setDescription('Whose rank to show'))),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!config.valorant.isConfigured) {
      await interaction.reply({ content: t('cmd.valorant.notConfigured', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      const token = randomBytes(20).toString('hex');
      await redis.set(`valorant:link:${token}`, interaction.user.id, 'EX', 600);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('cmd.valorant.linkButton', loc)).setURL(`${API_BASE}/valorant/rso/start?token=${token}`),
      );
      await interaction.reply({ content: t('cmd.valorant.linkPrompt', loc), components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'unlink') {
      const res = await prisma.valorantLink.deleteMany({ where: { discordId: interaction.user.id } });
      await interaction.reply({ content: res.count ? t('cmd.valorant.unlinked', loc) : t('cmd.valorant.notLinkedSelf', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    // rank
    const user = interaction.options.getUser('user') ?? interaction.user;
    const link = await prisma.valorantLink.findUnique({ where: { discordId: user.id } });
    if (!link) {
      await interaction.reply({ content: t('cmd.valorant.notLinked', loc, { user: `<@${user.id}>` }), flags: MessageFlags.Ephemeral });
      return;
    }
    const tier = link.currentTier ?? 0;
    const embed = new EmbedBuilder()
      .setColor(tierColor(tier))
      .setAuthor({ name: `${link.gameName}#${link.tagLine}`, iconURL: user.displayAvatarURL() })
      .addFields(
        { name: t('cmd.valorant.currentRank', loc), value: link.lastSyncAt ? tierName(tier) : t('cmd.valorant.syncing', loc), inline: true },
        { name: t('cmd.valorant.peak', loc), value: tierName(link.peakTier ?? 0), inline: true },
      )
      .setFooter({ text: 'VALORANT' });
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
