/**
 * Defines the built-in achievement catalogue and provides helpers for awarding
 * and querying achievements earned by guild members.
 */

import { prisma } from '../../database.js';
import { logger } from '../../logger.js';

/** A single achievement definition. */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Returns true when the given user stats satisfy the earn condition. */
  check: (stats: UserStats) => boolean;
}

/** A snapshot of a user's leveling stats used for achievement evaluation. */
export interface UserStats {
  level: number;
  totalMessages: number;
  xp: number;
  streakDays?: number;
}

/**
 * The full set of built-in achievements. These are code-defined and apply across
 * all guilds. To add a new achievement, append an entry here — it will be awarded
 * retroactively the next time a user sends a message.
 */
export const ACHIEVEMENTS: Achievement[] = [
  // Leveling milestones
  { id: 'level_5',   name: 'Rising Star',   description: 'Reach level 5',   emoji: '🥉', check: (s) => s.level >= 5 },
  { id: 'level_10',  name: 'Active Member', description: 'Reach level 10',  emoji: '🥈', check: (s) => s.level >= 10 },
  { id: 'level_25',  name: 'Veteran',       description: 'Reach level 25',  emoji: '🥇', check: (s) => s.level >= 25 },
  { id: 'level_50',  name: 'Elite',         description: 'Reach level 50',  emoji: '🔥', check: (s) => s.level >= 50 },
  { id: 'level_100', name: 'Legend',        description: 'Reach level 100', emoji: '🌟', check: (s) => s.level >= 100 },
  // Daily message streak milestones
  { id: 'streak_7',  name: 'Week Warrior',    description: 'Maintain a 7-day message streak',  emoji: '🔥', check: (s) => (s.streakDays ?? 0) >= 7 },
  { id: 'streak_30', name: 'Month Legend',    description: 'Maintain a 30-day message streak', emoji: '🌟', check: (s) => (s.streakDays ?? 0) >= 30 },
  { id: 'streak_100',name: 'Century Streak',  description: 'Maintain a 100-day message streak', emoji: '💯', check: (s) => (s.streakDays ?? 0) >= 100 },
  // Lifetime message count milestones
  { id: 'msg_100',   name: 'Chatty',       description: 'Send 100 messages',   emoji: '💬', check: (s) => s.totalMessages >= 100 },
  { id: 'msg_500',   name: 'Talkative',    description: 'Send 500 messages',   emoji: '🗣️', check: (s) => s.totalMessages >= 500 },
  { id: 'msg_1000',  name: 'Dedicated',    description: 'Send 1,000 messages', emoji: '📢', check: (s) => s.totalMessages >= 1000 },
  { id: 'msg_5000',  name: 'Unstoppable',  description: 'Send 5,000 messages', emoji: '⚡', check: (s) => s.totalMessages >= 5000 },
  { id: 'msg_10000', name: 'Transcendent', description: 'Send 10,000 messages', emoji: '🏆', check: (s) => s.totalMessages >= 10000 },
];

export class AchievementsModule {
  /**
   * Evaluates all achievements against the provided stats and persists any that
   * have been newly earned. Already-earned achievements are skipped via a Set
   * lookup to avoid redundant database writes.
   *
   * @returns The list of achievements earned for the first time during this call.
   */
  static async checkAndAward(
    guildId: string,
    userId: string,
    stats: UserStats,
  ): Promise<Achievement[]> {
    try {
      const existing = await prisma.userAchievement.findMany({
        where: { guildId, userId },
        select: { achievementId: true },
      });

      const earned = new Set(existing.map((a) => a.achievementId));
      const newlyEarned: Achievement[] = [];

      for (const achievement of ACHIEVEMENTS) {
        if (earned.has(achievement.id)) continue;
        if (!achievement.check(stats)) continue;

        await prisma.userAchievement.create({
          data: { guildId, userId, achievementId: achievement.id },
        });
        newlyEarned.push(achievement);
      }

      return newlyEarned;
    } catch (err) {
      logger.error({ err, guildId, userId }, 'Failed to check achievements');
      return [];
    }
  }

  /** Get all achievements earned by a user in a guild */
  static async getUserAchievements(
    guildId: string,
    userId: string,
  ): Promise<Array<Achievement & { earnedAt: Date }>> {
    try {
      const records = await prisma.userAchievement.findMany({
        where: { guildId, userId },
        orderBy: { earnedAt: 'asc' },
      });

      return records
        .map((r) => {
          const def = ACHIEVEMENTS.find((a) => a.id === r.achievementId);
          if (!def) return null;
          return { ...def, earnedAt: r.earnedAt };
        })
        .filter((a): a is Achievement & { earnedAt: Date } => a !== null);
    } catch (err) {
      logger.error({ err, guildId, userId }, 'Failed to get user achievements');
      return [];
    }
  }
}
