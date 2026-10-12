
/**
 * The server economy: per-guild virtual currency. Handles balances (wallet and
 * bank), daily rewards, transfers, the shop and inventory, and the weekly
 * lottery draw. The gambling games' math lives separately in `games.ts` so it
 * can be tested on its own.
 */
import { prisma } from '../../database.js';
import { EmbedBuilder, type Guild, type TextChannel } from 'discord.js';
import { COLORS } from '@arkenbot/shared';
import { swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { EconomyConfig, EconomyBalance } from '@prisma/client';

export type Config = EconomyConfig;
export type Balance = EconomyBalance;

export class EconomyModule {

  static async getConfig(guildId: string): Promise<EconomyConfig | null> {
    return prisma.economyConfig.findUnique({ where: { guildId } });
  }

  static async getConfigOrDefault(guildId: string): Promise<EconomyConfig> {
    const cfg = await this.getConfig(guildId);
    if (cfg) return cfg;
    return {
      id: '', guildId, enabled: false, currencyName: 'Coins', currencySymbol: '🪙',
      startingBalance: 0, dailyAmount: 200, dailyStreakBonus: 50, workMin: 50, workMax: 300,
      workCooldown: 3600, robEnabled: true, robCooldown: 86400, robSuccessRate: 40,
      robMaxPercent: 20, robMinBalance: 500, robFinePercent: 15, gamblingEnabled: true,
      maxBet: 10000, createdAt: new Date(), updatedAt: new Date(),
    } as EconomyConfig;
  }

  static async getBalance(guildId: string, userId: string, startingBalance = 0): Promise<EconomyBalance> {
    const existing = await prisma.economyBalance.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (existing) return existing;
    return prisma.economyBalance.create({
      data: { guildId, userId, wallet: startingBalance },
    });
  }

  static async addWallet(guildId: string, userId: string, amount: number, starting = 0): Promise<EconomyBalance> {
    await this.getBalance(guildId, userId, starting);
    return prisma.$transaction(async (tx) => {
      const row = await tx.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
      const next = Math.max(0, (row?.wallet ?? 0) + amount);
      return tx.economyBalance.update({
        where: { guildId_userId: { guildId, userId } },
        data: { wallet: next },
      });
    });
  }

  static net(bal: EconomyBalance): number {
    return bal.wallet + bal.bank;
  }

  static format(amount: number, cfg: Pick<EconomyConfig, 'currencySymbol'>): string {
    return `${cfg.currencySymbol} ${amount.toLocaleString('en-US')}`;
  }

  static async rank(guildId: string, userId: string): Promise<number> {
    const me = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (!me) return 0;
    const myNet = this.net(me);

    const rows = await prisma.economyBalance.findMany({ where: { guildId }, select: { wallet: true, bank: true } });
    const richer = rows.filter((r) => r.wallet + r.bank > myNet).length;
    return richer + 1;
  }

  static cooldownRemaining(last: Date | null, windowSeconds: number, now = Date.now()): number {
    if (!last) return 0;
    const readyAt = last.getTime() + windowSeconds * 1000;
    return Math.max(0, readyAt - now);
  }

  static async awardLevelUp(guildId: string, userId: string, newLevel: number): Promise<number> {
    const cfg = await this.getConfig(guildId);
    if (!cfg?.enabled || cfg.levelUpReward <= 0) return 0;
    const reward = cfg.levelUpReward * newLevel;
    await this.addWallet(guildId, userId, reward, cfg.startingBalance);
    return reward;
  }

  static async incomeForRoles(guildId: string, roleIds: string[]): Promise<number> {
    if (roleIds.length === 0) return 0;
    const rows = await prisma.economyIncomeRole.findMany({ where: { guildId, roleId: { in: roleIds } } });
    return rows.reduce((sum, r) => sum + r.amount, 0);
  }

  static bankInterest(bank: number, cfg: Pick<Config, 'bankInterestPct' | 'bankInterestCap'>): number {
    if (cfg.bankInterestPct <= 0 || bank <= 0) return 0;
    const raw = Math.floor(bank * (cfg.bankInterestPct / 100));
    return cfg.bankInterestCap > 0 ? Math.min(raw, cfg.bankInterestCap) : raw;
  }

  static readyTag(remainingMs: number, now = Date.now()): string {
    return `<t:${Math.floor((now + remainingMs) / 1000)}:R>`;
  }

  static async drawLottery(guild: Guild): Promise<boolean> {
    const cfg = await this.getConfig(guild.id);
    if (!cfg?.enabled || !cfg.lotteryEnabled) return false;
    const rows = await prisma.economyLotteryTicket.findMany({ where: { guildId: guild.id } });
    const totalTickets = rows.reduce((s, r) => s + r.tickets, 0);
    if (rows.length < 2 || totalTickets < 1) return false;

    let pick = Math.floor(Math.random() * totalTickets);
    let winner = rows[0];
    for (const r of rows) { if (pick < r.tickets) { winner = r; break; } pick -= r.tickets; }

    const pot = totalTickets * cfg.lotteryTicketPrice;
    await this.addWallet(guild.id, winner.userId, pot, cfg.startingBalance);
    await prisma.economyLotteryTicket.deleteMany({ where: { guildId: guild.id } });

    const channelId = cfg.lotteryChannelId ?? undefined;
    if (channelId) {
      const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
      if (channel?.isTextBased()) {
        const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
        const embed = new EmbedBuilder().setColor(COLORS.WARNING).setTitle(t('lottery.drawTitle', loc))
          .setDescription(t('lottery.drawWinner', loc, { user: `<@${winner.userId}>`, pot: this.format(pot, cfg), tickets: String(totalTickets) }))
          .setTimestamp();
        await channel.send({ content: `<@${winner.userId}>`, embeds: [embed], allowedMentions: { users: [winner.userId] } }).catch(swallow);
      }
    }
    return true;
  }
}
