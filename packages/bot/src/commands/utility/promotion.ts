/**
 * /promotion — view who promotes the server (leaderboard) or check a member's
 * total promotion time. No-ops with a friendly message unless tracking is on.
 */
import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags, type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { PromotionModule, type PromoAggregate } from '../../modules/promotion/PromotionModule.js';

function fmt(totalSeconds: number, loc: string): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return t('cmd.promotion.dh', loc, { d, h });
  if (h > 0) return t('cmd.promotion.hm', loc, { h, m });
  if (m > 0) return t('cmd.promotion.mOnly', loc, { m });
  return t('cmd.promotion.lessMin', loc);
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('promotion')
    .setDescription('See who promotes the server and for how long')
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Top members ranked by promotion time'))
    .addSubcommand((s) => s.setName('check').setDescription("Check a member's promotion time")
      .addUserOption((o) => o.setName('user').setDescription('Whose promotion time to show'))),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guildId) {
      await interaction.reply({ content: t('common.notInServer', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    if (!PromotionModule.isEnabled(interaction.guildId)) {
      await interaction.reply({ content: t('cmd.promotion.notEnabled', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'leaderboard') {
      const rows = await PromotionModule.getLeaderboard(interaction.guildId, 10);
      if (rows.length === 0) {
        await interaction.editReply(t('cmd.promotion.lbEmpty', loc));
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r: PromoAggregate, i: number) => {
        const total = (Number(r.status_seconds) || 0) + (Number(r.tag_seconds) || 0);
        const live = r.status_active || r.tag_active ? ' 🟢' : '';
        return `${medals[i] ?? `**${i + 1}.**`} **${r.username ?? r.userId}** — ${fmt(total, loc)}${live}`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t('cmd.promotion.lbTitle', loc))
        .setDescription(lines.join('\n'))
        .setFooter({ text: t('cmd.promotion.footer', loc) });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // check
    const target = interaction.options.getUser('user') ?? interaction.user;
    const sum = await PromotionModule.getSummary(interaction.guildId, target.id);
    if (!sum) {
      await interaction.editReply(t('cmd.promotion.checkNever', loc, { name: target.username }));
      return;
    }
    const statusS = Number(sum.status_seconds) || 0;
    const tagS = Number(sum.tag_seconds) || 0;
    const active = sum.status_active || sum.tag_active;
    const embed = new EmbedBuilder()
      .setColor(active ? 0x57f287 : 0x5865f2)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setTitle(t('cmd.promotion.checkTitle', loc))
      .addFields(
        { name: t('cmd.promotion.fieldTotal', loc), value: fmt(statusS + tagS, loc), inline: false },
        { name: t('cmd.promotion.fieldStatus', loc), value: `${fmt(statusS, loc)}${sum.status_active ? ' 🟢' : ''}`, inline: true },
        { name: t('cmd.promotion.fieldTag', loc), value: `${fmt(tagS, loc)}${sum.tag_active ? ' 🟢' : ''}`, inline: true },
      )
      .setFooter({ text: t('cmd.promotion.footer', loc) });
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
