/**
 * Implements the counting game: validates messages in the designated counting
 * channel, supports simple math expressions, enforces same-user and consecutive-
 * number rules, and optionally resets the count on failure.
 */

import type { Message } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow} from '../../logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Evaluates a simple math expression containing only digits and the operators
 * `+ - * / ( ) .`. Returns `NaN` for any expression that contains other
 * characters or that does not produce a finite integer.
 *
 * The input is validated against a strict allowlist before evaluation to prevent
 * arbitrary code execution.
 */
function safeEval(expr: string): number {
  if (!/^[\d\s+\-*/.()]+$/.test(expr)) return NaN;
  try {
     
    const result = Function('"use strict"; return (' + expr + ')')();
    return typeof result === 'number' && isFinite(result) ? Math.floor(result) : NaN;
  } catch {
    return NaN;
  }
}

async function getAddonSettings(guildId: string): Promise<Record<string, unknown> | null> {
  const ga = await prisma.guildAddon.findFirst({
    where: { guildId, addon: { name: 'counting' }, enabled: true },
    select: { settings: true },
  }).catch(swallow);
  return ga ? (ga.settings as Record<string, unknown>) : null;
}

export class CountingModule {
  /**
   * Validates a message posted in the guild's counting channel. Reacts with ✅
   * on a correct count, ❌ and optionally resets on an incorrect count or a
   * same-user repeat, and celebrates with 🎉 every 100 counts.
   */
  static async check(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    if (!message.channel.isTextBased()) return;

    const settings = await getAddonSettings(message.guild.id);
    if (!settings?.channelId || settings.channelId !== message.channel.id) return;

    const state = await db.countingState.findUnique({
      where: { guildId: message.guild.id },
    }).catch(swallow);

    const expected = (state?.currentCount ?? 0) + 1;
    const raw = message.content.trim();
    // Silently ignore non-numeric messages so the channel can still be used for
    // bot output, reactions, etc. without triggering false failures.
    if (!/^[\d\s+\-*/.()]+$/.test(raw)) return;
    const num = safeEval(raw);
    const allowSameUser = settings.allowSameUser === true;
    const resetOnFail = settings.resetOnFail !== false;

    const ch = message.channel as { send?: (t: string) => Promise<unknown> };
    const send = (text: string) => ch.send?.(text).catch(swallow) ?? Promise.resolve();

    if (isNaN(num) || num !== expected) {
      await message.react('❌').catch(swallow);
      if (resetOnFail) {
        await db.countingState.upsert({
          where:  { guildId: message.guild.id },
          update: { currentCount: 0, lastUserId: null },
          create: { guildId: message.guild.id, channelId: String(settings.channelId), currentCount: 0 },
        }).catch(swallow);
        await send(`❌ <@${message.author.id}> ruined the count at **${state?.currentCount ?? 0}**! Start again from **1**.`);
      }
      return;
    }

    if (!allowSameUser && state?.lastUserId === message.author.id) {
      await message.react('❌').catch(swallow);
      if (resetOnFail) {
        await db.countingState.upsert({
          where:  { guildId: message.guild.id },
          update: { currentCount: 0, lastUserId: null },
          create: { guildId: message.guild.id, channelId: String(settings.channelId), currentCount: 0 },
        }).catch(swallow);
        await send(`❌ <@${message.author.id}> can't count twice in a row! Count reset — start again from **1**.`);
      }
      return;
    }

    const newBest = Math.max(num, state?.bestCount ?? 0);
    await db.countingState.upsert({
      where:  { guildId: message.guild.id },
      update: { currentCount: num, lastUserId: message.author.id, bestCount: newBest },
      create: {
        guildId:      message.guild.id,
        channelId:    String(settings.channelId),
        currentCount: num,
        lastUserId:   message.author.id,
        bestCount:    newBest,
      },
    }).catch((err: unknown) => logger.error({ err }, 'CountingModule: failed to update state'));

    // Milestone every 100 counts gets a celebration reaction.
    await message.react(num % 100 === 0 ? '🎉' : '✅').catch(swallow);
  }
}
