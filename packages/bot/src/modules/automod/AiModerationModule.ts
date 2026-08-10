/**
 * Context-aware moderation using the LLM.
 *
 * Keyword filters miss things phrased around them — subtle harassment, coded
 * hate, veiled threats, and social-engineering scams. This module asks the model
 * to classify a message and, when it is confidently harmful, either flags it for
 * moderators or deletes it.
 *
 * It is opt-in per guild and deliberately bounded, because running a model on
 * chat traffic is expensive:
 *  - a cheap length pre-gate skips trivial and giant messages,
 *  - a per-guild token-bucket caps how many messages are scanned per minute,
 *  - the default action is "flag" (alert only), never a silent auto-ban.
 */
import { type Message, type TextChannel, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { chatCompletion, isLLMAvailable } from '@arkenbot/shared';
import type { AutoModConfig } from '@arkenbot/shared';
import { logger, swallow} from '../../logger.js';

/** Only scan messages within this length band — skip "lol" and copy-paste walls. */
const MIN_LENGTH = 24;
const MAX_LENGTH = 800;

/** Per-guild budget: at most this many AI scans per rolling minute. */
const SCANS_PER_MINUTE = 20;

/** Categories the model may return; `none` means the message is fine. */
type Category = 'none' | 'harassment' | 'hate' | 'threat' | 'sexual' | 'scam' | 'self_harm';
type Severity = 'low' | 'medium' | 'high';

interface Verdict {
  category: Category;
  severity: Severity;
  reason: string;
}

const SYSTEM_PROMPT = [
  'You are a Discord moderation classifier. Read one message and judge whether it violates community standards.',
  'Respond ONLY with a JSON object: {"category": one of "none"|"harassment"|"hate"|"threat"|"sexual"|"scam"|"self_harm", "severity": "low"|"medium"|"high", "reason": short explanation}.',
  'Use "none" for banter, jokes, profanity used casually, criticism, or anything not clearly harmful.',
  'Only flag content that is genuinely abusive, hateful, threatening, sexually explicit toward someone, a scam/phishing attempt, or self-harm related.',
  'Be conservative: when unsure, return "none". Judge the message on its own, not hypothetical intent.',
].join(' ');

export class AiModerationModule {
  /** Returns true when this guild is within its per-minute scan budget. */
  private static async withinBudget(guildId: string): Promise<boolean> {
    const key = `automod:ai:budget:${guildId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= SCANS_PER_MINUTE;
  }

  /**
   * Classifies a message and acts if it is confidently harmful. Assumes the
   * caller has already applied exempt-role/channel and bot-author filtering.
   * Never throws — moderation must not break message handling.
   */
  static async scan(message: Message, config: AutoModConfig): Promise<void> {
    if (!isLLMAvailable()) return;

    const content = message.content.trim();
    if (content.length < MIN_LENGTH || content.length > MAX_LENGTH) return;

    try {
      if (!(await this.withinBudget(message.guild!.id))) return;

      const raw = await chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        { temperature: 0, maxTokens: 150, json: true, timeoutMs: 8000 },
      );

      const verdict = JSON.parse(raw || '{}') as Partial<Verdict>;
      const category = verdict.category ?? 'none';
      const severity = verdict.severity ?? 'low';

      // Only act on a clear, non-trivial violation.
      if (category === 'none' || severity === 'low') return;

      await this.act(message, config, {
        category,
        severity,
        reason: (verdict.reason ?? '').slice(0, 300),
      });
    } catch (err) {
      logger.warn({ err, guildId: message.guild?.id }, 'AI moderation scan failed');
    }
  }

  /** Deletes (if configured) and logs the flagged message for moderators. */
  private static async act(message: Message, config: AutoModConfig, verdict: Verdict): Promise<void> {
    const deleted = config.aiModAction === 'delete';
    if (deleted) await message.delete().catch(swallow);

    await prisma.logEntry.create({
      data: {
        guildId: message.guild!.id,
        type: 'automod',
        userId: message.author.id,
        data: {
          action: deleted ? 'delete' : 'flag',
          reason: `AI: ${verdict.category} (${verdict.severity}) — ${verdict.reason}`,
          channelId: message.channelId,
          source: 'ai',
        },
      },
    }).catch(swallow);

    // Post a moderator alert to the same channel when only flagging, so it is
    // visible without a separate log channel; deletions are surfaced via the log.
    if (!deleted && 'send' in message.channel) {
      const embed = new EmbedBuilder()
        .setColor(verdict.severity === 'high' ? 0xed4245 : 0xfee75c)
        .setTitle('🤖 AI Moderation Flag')
        .setDescription(
          `Flagged a message from ${message.author} in ${message.channel} for review.\n\n` +
          `**Category:** ${verdict.category} · **Severity:** ${verdict.severity}\n` +
          `**Why:** ${verdict.reason || '—'}\n` +
          `[Jump to message](${message.url})`,
        )
        .setFooter({ text: 'AI-generated · review before acting' })
        .setTimestamp();
      await (message.channel as TextChannel).send({ embeds: [embed] }).catch(swallow);
    }
  }
}
