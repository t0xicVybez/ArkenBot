
import { type Message, type TextChannel, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { chatCompletion, isLLMAvailable } from '@arkenbot/shared';
import type { AutoModConfig } from '@arkenbot/shared';
import { logger, swallow} from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const MIN_LENGTH = 24;
const MAX_LENGTH = 800;

const SCANS_PER_MINUTE = 20;

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

  private static async withinBudget(guildId: string): Promise<boolean> {
    const key = `automod:ai:budget:${guildId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= SCANS_PER_MINUTE;
  }

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

  private static async act(message: Message, config: AutoModConfig, verdict: Verdict): Promise<void> {
    const deleted = config.aiModAction === 'delete';
    if (deleted) await message.delete().catch((e) => notifyActionFailure(message.guild!, { action: 'automodDelete', error: e, requiredPermission: 'Manage Messages', channelId: message.channelId, target: message.author.toString() }));

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

    if (!deleted && 'send' in message.channel) {
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: message.guild!.id, guildLocale: message.guild!.preferredLocale });
      const embed = new EmbedBuilder()
        .setColor(verdict.severity === 'high' ? 0xed4245 : 0xfee75c)
        .setTitle(t('automod.aiFlagTitle', loc))
        .setDescription(
          t('automod.aiFlagDescription', loc, {
            user: String(message.author),
            channel: String(message.channel),
            category: verdict.category,
            severity: verdict.severity,
            reason: verdict.reason || '—',
            url: message.url,
          }),
        )
        .setFooter({ text: t('automod.aiFlagFooter', loc) })
        .setTimestamp();
      await (message.channel as TextChannel).send({ embeds: [embed] }).catch(swallow);
    }
  }
}
