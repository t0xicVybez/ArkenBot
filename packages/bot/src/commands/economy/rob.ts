/** /rob — attempt to steal from another member's wallet; fail and pay a fine. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { EconomyModule } from '../../modules/economy/EconomyModule.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another member — risky!')
    .addUserOption((o) => o.setName('user').setDescription('Who to rob').setRequired(true)),
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
    if (!cfg.robEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.robDisabled', loc))] });
      return;
    }
    const target = interaction.options.getUser('user', true);
    if (target.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.robYourself', loc))] });
      return;
    }
    if (target.bot) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.noBots', loc))] });
      return;
    }
    const guildId = interaction.guild.id;
    const me = await EconomyModule.getBalance(guildId, interaction.user.id, cfg.startingBalance);
    const now = Date.now();
    const remaining = EconomyModule.cooldownRemaining(me.lastRob, cfg.robCooldown, now);
    if (remaining > 0) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.robWaitTitle', loc), t('economy.robWait', loc, { time: EconomyModule.readyTag(remaining, now) }))] });
      return;
    }
    const victim = await EconomyModule.getBalance(guildId, target.id, cfg.startingBalance);
    if (victim.wallet < cfg.robMinBalance) {
      await interaction.editReply({ embeds: [errorEmbed(t('economy.errorTitle', loc), t('economy.robTooPoor', loc, { user: `<@${target.id}>`, min: EconomyModule.format(cfg.robMinBalance, cfg) }))] });
      return;
    }
    // Stamp the cooldown regardless of outcome.
    await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { lastRob: new Date(now) } });

    const success = Math.random() * 100 < cfg.robSuccessRate;
    if (success) {
      const maxSteal = Math.floor(victim.wallet * (cfg.robMaxPercent / 100));
      const stolen = Math.max(1, Math.floor(Math.random() * maxSteal) + 1);
      await prisma.$transaction([
        prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: target.id } }, data: { wallet: { decrement: stolen } } }),
        prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { wallet: { increment: stolen } } }),
      ]);
      const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(t('economy.robWinTitle', loc))
        .setDescription(t('economy.robWin', loc, { amount: EconomyModule.format(stolen, cfg), user: `<@${target.id}>` })).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } else {
      const fine = Math.min(me.wallet, Math.floor(me.wallet * (cfg.robFinePercent / 100)));
      if (fine > 0) {
        await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId: interaction.user.id } }, data: { wallet: { decrement: fine } } });
      }
      const embed = new EmbedBuilder().setColor(COLORS.ERROR).setTitle(t('economy.robFailTitle', loc))
        .setDescription(t('economy.robFail', loc, { amount: EconomyModule.format(fine, cfg), user: `<@${target.id}>` })).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
