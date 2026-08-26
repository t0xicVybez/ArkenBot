import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  currencyName: z.string().min(1).max(32).optional(),
  currencySymbol: z.string().min(1).max(16).optional(),
  startingBalance: z.number().int().min(0).max(1_000_000).optional(),
  dailyAmount: z.number().int().min(0).max(1_000_000).optional(),
  dailyStreakBonus: z.number().int().min(0).max(100_000).optional(),
  workMin: z.number().int().min(0).max(1_000_000).optional(),
  workMax: z.number().int().min(0).max(1_000_000).optional(),
  workCooldown: z.number().int().min(0).max(604_800).optional(),
  robEnabled: z.boolean().optional(),
  robCooldown: z.number().int().min(0).max(604_800).optional(),
  robSuccessRate: z.number().int().min(0).max(100).optional(),
  robMaxPercent: z.number().int().min(1).max(100).optional(),
  robMinBalance: z.number().int().min(0).max(1_000_000).optional(),
  robFinePercent: z.number().int().min(0).max(100).optional(),
  gamblingEnabled: z.boolean().optional(),
  maxBet: z.number().int().min(1).max(10_000_000).optional(),
  levelUpReward: z.number().int().min(0).max(1_000_000).optional(),
  bankInterestPct: z.number().int().min(0).max(100).optional(),
  bankInterestCap: z.number().int().min(0).max(10_000_000).optional(),
  lotteryEnabled: z.boolean().optional(),
  lotteryTicketPrice: z.number().int().min(1).max(10_000_000).optional(),
  lotteryChannelId: z.string().max(32).nullish(),
});

const DEFAULTS = {
  enabled: false, currencyName: 'Coins', currencySymbol: '🪙', startingBalance: 0,
  dailyAmount: 200, dailyStreakBonus: 50, workMin: 50, workMax: 300, workCooldown: 3600,
  robEnabled: true, robCooldown: 86400, robSuccessRate: 40, robMaxPercent: 20,
  robMinBalance: 500, robFinePercent: 15, gamblingEnabled: true, maxBet: 10000,
  levelUpReward: 0, bankInterestPct: 0, bankInterestCap: 1000,
  lotteryEnabled: false, lotteryTicketPrice: 100, lotteryChannelId: null,
};

export async function economyRoutes(server: FastifyInstance): Promise<void> {
  // GET config
  server.get('/guilds/:guildId/economy/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.economyConfig.findUnique({ where: { guildId } });
    return reply.send({ success: true, data: config ?? { guildId, ...DEFAULTS } });
  });

  // PATCH config
  server.patch('/guilds/:guildId/economy/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = parse(ConfigSchema, request.body, reply);
    if (!body) return;
    // Keep workMin ≤ workMax so /work never picks an empty range.
    if (body.workMin !== undefined && body.workMax !== undefined && body.workMin > body.workMax) {
      return reply.code(400).send({ success: false, error: 'workMin cannot exceed workMax' });
    }
    const config = await prisma.economyConfig.upsert({
      where: { guildId },
      update: { ...body },
      create: { guildId, ...body },
    });
    return reply.send({ success: true, data: config });
  });

  // GET shop items
  server.get('/guilds/:guildId/economy/shop', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const items = await prisma.economyShopItem.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    return reply.send({ success: true, data: items });
  });

  // POST shop item
  server.post('/guilds/:guildId/economy/shop', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = parse(z.object({
      name: z.string().min(1).max(64),
      description: z.string().max(200).nullish(),
      price: z.number().int().min(1).max(10_000_000),
      roleId: z.string().max(32).nullish(),
      stock: z.number().int().min(-1).max(1_000_000).optional(),
      enabled: z.boolean().optional(),
    }), request.body, reply);
    if (!body) return;
    const count = await prisma.economyShopItem.count({ where: { guildId } });
    if (count >= 50) return reply.code(400).send({ success: false, error: 'Shop item limit reached (50)' });
    const item = await prisma.economyShopItem.create({ data: { guildId, ...body } });
    return reply.send({ success: true, data: item });
  });

  // PATCH shop item
  server.patch('/guilds/:guildId/economy/shop/:itemId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, itemId } = request.params as { guildId: string; itemId: string };
    const body = parse(z.object({
      name: z.string().min(1).max(64).optional(),
      description: z.string().max(200).nullish(),
      price: z.number().int().min(1).max(10_000_000).optional(),
      roleId: z.string().max(32).nullish(),
      stock: z.number().int().min(-1).max(1_000_000).optional(),
      enabled: z.boolean().optional(),
    }), request.body, reply);
    if (!body) return;
    const res = await prisma.economyShopItem.updateMany({ where: { id: itemId, guildId }, data: { ...body } });
    if (res.count === 0) return reply.code(404).send({ success: false, error: 'Item not found' });
    const item = await prisma.economyShopItem.findUnique({ where: { id: itemId } });
    return reply.send({ success: true, data: item });
  });

  // DELETE shop item
  server.delete('/guilds/:guildId/economy/shop/:itemId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, itemId } = request.params as { guildId: string; itemId: string };
    const res = await prisma.economyShopItem.deleteMany({ where: { id: itemId, guildId } });
    if (res.count === 0) return reply.code(404).send({ success: false, error: 'Item not found' });
    return reply.send({ success: true });
  });

  // GET income roles
  server.get('/guilds/:guildId/economy/income-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.economyIncomeRole.findMany({ where: { guildId }, orderBy: { amount: 'desc' } });
    return reply.send({ success: true, data: rows });
  });

  // PUT income role (upsert by role)
  server.put('/guilds/:guildId/economy/income-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = parse(z.object({
      roleId: z.string().min(1).max(32),
      amount: z.number().int().min(1).max(10_000_000),
    }), request.body, reply);
    if (!body) return;
    const count = await prisma.economyIncomeRole.count({ where: { guildId } });
    const exists = await prisma.economyIncomeRole.findUnique({ where: { guildId_roleId: { guildId, roleId: body.roleId } } });
    if (!exists && count >= 25) return reply.code(400).send({ success: false, error: 'Income role limit reached (25)' });
    const row = await prisma.economyIncomeRole.upsert({
      where: { guildId_roleId: { guildId, roleId: body.roleId } },
      update: { amount: body.amount },
      create: { guildId, roleId: body.roleId, amount: body.amount },
    });
    return reply.send({ success: true, data: row });
  });

  // DELETE income role
  server.delete('/guilds/:guildId/economy/income-roles/:roleId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, roleId } = request.params as { guildId: string; roleId: string };
    const res = await prisma.economyIncomeRole.deleteMany({ where: { guildId, roleId } });
    if (res.count === 0) return reply.code(404).send({ success: false, error: 'Income role not found' });
    return reply.send({ success: true });
  });
}
