/**
 * Giveaway scheduler job — ends giveaways whose time is up, picks winners, and
 * announces them. Extracted from BackgroundJobs (P3 split). The entry-weighting
 * and winner-selection are pure functions so they can be unit-tested without a
 * live Discord/DB.
 */
import { EmbedBuilder } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';

/** An eligible entrant and the role IDs they hold (for bonus-entry weighting). */
export interface GiveawayEntrant {
  id: string;
  roleIds: string[];
}

/**
 * Build the weighted entry pool: one entry per eligible user, plus extra copies
 * for each bonus role they hold. Pure.
 */
export function buildGiveawayEntries(
  eligible: GiveawayEntrant[],
  bonusRoleEntries: Array<{ roleId: string; bonusEntries: number }> | null | undefined,
): Array<{ id: string }> {
  const entries: Array<{ id: string }> = eligible.map((u) => ({ id: u.id }));
  if (bonusRoleEntries && bonusRoleEntries.length > 0) {
    for (const bonus of bonusRoleEntries) {
      for (const u of eligible) {
        if (u.roleIds.includes(bonus.roleId)) {
          for (let i = 0; i < bonus.bonusEntries; i++) entries.push({ id: u.id });
        }
      }
    }
  }
  return entries;
}

/**
 * Pick up to `count` unique winner IDs from a weighted entry pool. More entries
 * = higher chance; a user winning multiple weighted slots counts once. `rng` is
 * injectable for deterministic tests. Pure.
 */
export function pickGiveawayWinners(
  entries: Array<{ id: string }>,
  count: number,
  rng: () => number = Math.random,
): string[] {
  if (entries.length === 0 || count <= 0) return [];
  const shuffled = [...entries].sort(() => rng() - 0.5);
  const winners = shuffled.slice(0, count);
  return [...new Set(winners.map((w) => w.id))];
}

/** Scheduler entry point: end all giveaways whose time has elapsed. */
export async function runGiveaways(client: BotClient): Promise<void> {
  const now = new Date();
  try {
    const ended = await prisma.giveaway.findMany({ where: { ended: false, endsAt: { lte: now } } });
    for (const giveaway of ended) {
      await endGiveaway(client, giveaway);
    }
  } catch (err) {
    logger.error({ err }, 'Giveaway check failed');
  }
}

async function endGiveaway(
  client: BotClient,
  giveaway: Awaited<ReturnType<typeof prisma.giveaway.findFirst>> & object,
): Promise<void> {
  if (!giveaway) return;
  try {
    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel?.isTextBased() || !giveaway.messageId) {
      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
      return;
    }

    const msg = await channel.messages.fetch(giveaway.messageId).catch(swallow);
    const reaction = msg?.reactions.cache.get('🎉');
    const users = reaction ? await reaction.users.fetch().catch(swallow) : null;
    const eligibleBase = users?.filter((u) => !u.bot && u.id !== giveaway.hostId);

    // Filter by required role if set.
    const requiredRoleId = (giveaway as Record<string, unknown>).requiredRoleId as string | null | undefined;
    const eligible = requiredRoleId && eligibleBase
      ? eligibleBase.filter((_u: import('discord.js').User, id: string) => guild.members.cache.get(id)?.roles.cache.has(requiredRoleId) ?? false)
      : eligibleBase;

    // Map Discord users → {id, roleIds} and build the weighted pool / winners (pure).
    const bonusRoleEntries = (giveaway as Record<string, unknown>).bonusRoleEntries as Array<{ roleId: string; bonusEntries: number }> | null;
    const eligibleArr: GiveawayEntrant[] = eligible
      ? [...eligible.values()].map((u) => ({ id: u.id, roleIds: [...(guild.members.cache.get(u.id)?.roles.cache.keys() ?? [])] }))
      : [];
    const entries = buildGiveawayEntries(eligibleArr, bonusRoleEntries);

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: giveaway.guildId, guildLocale: guild.preferredLocale });

    let winnerIds: string[] = [];
    let winnerMentions = t('giveaway.noEntrants', loc);
    if (entries.length > 0) {
      winnerIds = pickGiveawayWinners(entries, giveaway.winnersCount);
      winnerMentions = winnerIds.map((id) => `<@${id}>`).join(', ');
    }

    const winnerLabel = winnerIds.length > 1 ? t('giveaway.winnersLabel', loc) : t('giveaway.winnerLabel', loc);

    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true, winnerIds } });

    await channel.send({
      content: t('giveaway.ended', loc, { winnerLabel, winners: winnerMentions, prize: giveaway.prize }),
    });

    if (msg) {
      const endedEmbed = new EmbedBuilder()
        .setTitle(t('giveaway.endedTitle', loc))
        .setDescription(t('giveaway.endedEmbed', loc, { prize: giveaway.prize, winnerLabel, winners: winnerMentions }))
        .setColor(0x95a5a6)
        .setTimestamp();
      await msg.edit({ embeds: [endedEmbed] }).catch(swallow);
    }

    logger.info({ id: giveaway.id, guildId: giveaway.guildId }, 'Giveaway ended');
  } catch (err) {
    logger.error({ err, id: giveaway?.id }, 'Failed to end giveaway');
  }
}
