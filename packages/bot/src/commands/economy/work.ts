/** /work — earn a randomised reward on a cooldown, with a flavour job line. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const JOB_COUNT = 8; // economy.jobs.0 .. economy.jobs.7

const command: BotCommand = {
  data: new SlashCommandBuilder().setName('work').setDescription('Work a shift to earn some currency'),
  category: 'Economy',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }
    const cfg = await EconomyModule.getConfig(interaction.guild.id);
    if (!cfg?.enabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.disabledTitle', loc), t('economy.disabled', loc))] });
      return;
    }
    const bal = await EconomyModule.getBalance(interaction.guild.id, interaction.user.id, cfg.startingBalance);
    const now = Date.now();
    const remaining = EconomyModule.cooldownRemaining(bal.lastWork, cfg.workCooldown, now);
    if (remaining > 0) {
      await interaction.editReply({
        embeds: [errorEmbed(t('economy.workWaitTitle', loc), t('economy.workWait', loc, { time: EconomyModule.readyTag(remaining, now) }))],
      });
      return;
    }
    const lo = Math.min(cfg.workMin, cfg.workMax);
    const hi = Math.max(cfg.workMin, cfg.workMax);
    const reward = lo + Math.floor(Math.random() * (hi - lo + 1));
    const job = t(`economy.jobs.${Math.floor(Math.random() * JOB_COUNT)}`, loc, { amount: EconomyModule.format(reward, cfg) });
    await prisma.economyBalance.update({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } },
      data: { wallet: { increment: reward }, lastWork: new Date(now) },
    });
    const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.workTitle', loc)).setDescription(job).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
