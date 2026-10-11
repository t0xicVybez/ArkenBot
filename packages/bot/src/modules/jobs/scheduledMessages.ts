/** scheduledMessages scheduler job(s) — extracted from BackgroundJobs (P3 god-file split). */
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { computeNextOccurrence } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import type { BotClient } from '../../client.js';

export async function runScheduledMessages(client: BotClient): Promise<void> {
  const now = new Date();

  try {
    const due = await prisma.scheduledMessage.findMany({
      where: {
        enabled: true,
        scheduledAt: { lte: now },
      },
    });

    for (const msg of due) {
      await sendScheduledMessage(client, msg);
    }
  } catch (err) {
    logger.error({ err }, 'Scheduled messages check failed');
  }
}

async function sendScheduledMessage(
  client: BotClient,
  msg: Awaited<ReturnType<typeof prisma.scheduledMessage.findFirst>> & object,
): Promise<void> {
  if (!msg) return;
  try {
    // Claim the message atomically by matching the expected lastSentAt value.
    // If a concurrent worker already sent it, `count` will be 0 and we abort
    // to prevent duplicate delivery.
    const claimed = await prisma.scheduledMessage.updateMany({
      where: {
        id: msg.id,
        lastSentAt: msg.lastSentAt ?? null,
      },
      data: { lastSentAt: new Date() },
    });
    if (claimed.count === 0) return;

    const guild = client.guilds.cache.get(msg.guildId);
    const channel = guild?.channels.cache.get(msg.channelId) as TextChannel | undefined;

    if (!channel?.isTextBased()) {
      await recordScheduledFailure(msg.id, 'Channel not found — deleted or the bot lost access');
      return;
    }

    const roleMention = (msg as unknown as { roleMentionId?: string | null }).roleMentionId
      ? `<@&${(msg as unknown as { roleMentionId: string }).roleMentionId}> `
      : '';
    if (msg.embed) {
      const schedSettings = await getGuildSettings(msg.guildId);
      const schedColor = schedSettings?.scheduledMessageColor
        ? parseInt(schedSettings.scheduledMessageColor.replace('#', ''), 16)
        : 0x5865f2;
      await channel.send({
        content: roleMention || undefined,
        embeds: [
          new EmbedBuilder()
            .setDescription(msg.content)
            .setColor(schedColor)
            .setTimestamp(),
        ],
      });
    } else {
      await channel.send({ content: `${roleMention}${msg.content}` });
    }

    // Advance to the next occurrence; disable the record if it has no repeat
    // interval. A successful send also resets the consecutive-failure counter.
    const nextAt = computeNextOccurrence(msg.scheduledAt, msg.repeat ?? null, msg.timezone ?? null, msg.daysOfWeek ?? []);
    await prisma.scheduledMessage.update({
      where: { id: msg.id },
      data: nextAt
        ? { scheduledAt: nextAt, failureCount: 0, lastError: null }
        : { enabled: false, failureCount: 0, lastError: null },
    });

    logger.info({ id: msg.id, guildId: msg.guildId }, 'Scheduled message sent');
  } catch (err) {
    logger.error({ err, id: msg.id }, 'Failed to send scheduled message');
    // Permission-type failures repeat forever until someone fixes the
    // channel — count them and auto-disable instead of retrying every minute.
    const code = (err as { code?: number }).code;
    if (code === 50001 || code === 50013 || code === 10003) {
      const reason = `Discord error ${code}: ${(err as Error).message ?? 'permission denied'}`;
      await recordScheduledFailure(msg.id, reason);
    }
  }
}

async function recordScheduledFailure(id: string, reason: string): Promise<void> {
  const MAX_FAILURES = 5;
  try {
    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data: { failureCount: { increment: 1 }, lastError: reason.slice(0, 300) },
      select: { failureCount: true, guildId: true },
    });
    if (updated.failureCount >= MAX_FAILURES) {
      await prisma.scheduledMessage.update({ where: { id }, data: { enabled: false } });
      logger.warn(
        { id, guildId: updated.guildId, failures: updated.failureCount, reason },
        `Scheduled message auto-disabled after ${MAX_FAILURES} consecutive failures`,
      );
    }
  } catch { /* row deleted mid-flight — nothing to record */ }
}
