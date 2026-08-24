/**
 * EconomyModule — shared helpers for the guild economy feature.
 *
 * Centralises config loading, balance mutations (wallet/bank), cooldown maths
 * and currency formatting so the individual command files stay thin. All money
 * operations clamp at zero and run inside interactive transactions where a
 * read-modify-write race could otherwise let a balance go negative (pay, rob,
 * gambling, purchases).
 */
import { prisma } from '../../database.js';
import type { EconomyConfig, EconomyBalance } from '@prisma/client';

export type Config = EconomyConfig;
export type Balance = EconomyBalance;

export class EconomyModule {
  /** Fetch (never create) the per-guild economy config. */
  static async getConfig(guildId: string): Promise<EconomyConfig | null> {
    return prisma.economyConfig.findUnique({ where: { guildId } });
  }

  /** Fetch config or a defaulted in-memory object when the guild has none yet. */
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

  /** Get (creating on first touch) a user's balance row, seeded with startingBalance. */
  static async getBalance(guildId: string, userId: string, startingBalance = 0): Promise<EconomyBalance> {
    const existing = await prisma.economyBalance.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (existing) return existing;
    return prisma.economyBalance.create({
      data: { guildId, userId, wallet: startingBalance },
    });
  }

  /** Add (or subtract, with a negative amount) to a user's wallet, clamped at zero. */
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

  /** Net worth = wallet + bank. */
  static net(bal: EconomyBalance): number {
    return bal.wallet + bal.bank;
  }

  /** Format an amount with the guild's currency symbol, e.g. "🪙 1,250". */
  static format(amount: number, cfg: Pick<EconomyConfig, 'currencySymbol'>): string {
    return `${cfg.currencySymbol} ${amount.toLocaleString('en-US')}`;
  }

  /** Rank (1-based) of a user by net worth within the guild. */
  static async rank(guildId: string, userId: string): Promise<number> {
    const me = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (!me) return 0;
    const myNet = this.net(me);
    // Count everyone strictly richer. Prisma can't compare two columns' sum, so pull the field-sums.
    const rows = await prisma.economyBalance.findMany({ where: { guildId }, select: { wallet: true, bank: true } });
    const richer = rows.filter((r) => r.wallet + r.bank > myNet).length;
    return richer + 1;
  }

  /**
   * Returns remaining cooldown in ms for a timestamp+window pair, or 0 if ready.
   */
  static cooldownRemaining(last: Date | null, windowSeconds: number, now = Date.now()): number {
    if (!last) return 0;
    const readyAt = last.getTime() + windowSeconds * 1000;
    return Math.max(0, readyAt - now);
  }

  /** Discord relative-timestamp tag for "ready in" messaging (auto-localised per viewer). */
  static readyTag(remainingMs: number, now = Date.now()): string {
    return `<t:${Math.floor((now + remainingMs) / 1000)}:R>`;
  }
}
