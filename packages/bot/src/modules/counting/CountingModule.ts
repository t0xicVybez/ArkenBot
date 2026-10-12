

import type { Message } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow} from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function safeEval(expr: string): number {
  if (!/^[\d\s+\-*/.()]+$/.test(expr)) return NaN;
  try {

    const result = Function('"use strict"; return (' + expr + ')')();
    return typeof result === 'number' && isFinite(result) ? Math.floor(result) : NaN;
  } catch {
    return NaN;
  }
}

export class CountingModule {

  static async check(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    if (!message.channel.isTextBased()) return;

    const state = await db.countingState.findUnique({
      where: { guildId: message.guild.id },
    }).catch(swallow);
    if (!state?.channelId || state.channelId !== message.channel.id) return;

    const expected = (state.currentCount ?? 0) + 1;
    const raw = message.content.trim();

    if (!/^[\d\s+\-*/.()]+$/.test(raw)) return;
    const num = safeEval(raw);
    const allowSameUser = state.allowSameUser === true;
    const resetOnFail = state.resetOnFail !== false;

    const ch = message.channel as { send?: (t: string) => Promise<unknown> };
    const send = (text: string) => ch.send?.(text).catch(swallow) ?? Promise.resolve();
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: message.guild.id, guildLocale: message.guild.preferredLocale });

    if (isNaN(num) || num !== expected) {
      await message.react('❌').catch(swallow);
      if (resetOnFail) {
        await db.countingState.upsert({
          where:  { guildId: message.guild.id },
          update: { currentCount: 0, lastUserId: null },
          create: { guildId: message.guild.id, channelId: state.channelId, currentCount: 0 },
        }).catch(swallow);
        await send(t('counting.ruined', loc, { user: `<@${message.author.id}>`, count: state?.currentCount ?? 0 }));
      }
      return;
    }

    if (!allowSameUser && state?.lastUserId === message.author.id) {
      await message.react('❌').catch(swallow);
      if (resetOnFail) {
        await db.countingState.upsert({
          where:  { guildId: message.guild.id },
          update: { currentCount: 0, lastUserId: null },
          create: { guildId: message.guild.id, channelId: state.channelId, currentCount: 0 },
        }).catch(swallow);
        await send(t('counting.twiceInRow', loc, { user: `<@${message.author.id}>` }));
      }
      return;
    }

    const newBest = Math.max(num, state?.bestCount ?? 0);
    await db.countingState.upsert({
      where:  { guildId: message.guild.id },
      update: { currentCount: num, lastUserId: message.author.id, bestCount: newBest },
      create: {
        guildId:      message.guild.id,
        channelId:    state.channelId,
        currentCount: num,
        lastUserId:   message.author.id,
        bestCount:    newBest,
      },
    }).catch((err: unknown) => logger.error({ err }, 'CountingModule: failed to update state'));

    await message.react(num % 100 === 0 ? '🎉' : '✅').catch(swallow);
  }
}
