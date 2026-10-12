

import { logger } from '../logger.js';
import type { BotClient } from '../client.js';

import { XPDecayModule } from './leveling/XPDecayModule.js';
import { EventsModule } from './events/EventsModule.js';
import { ModmailModule } from './modmail/ModmailModule.js';
import { AnalyticsModule } from './AnalyticsModule.js';
import { PromotionModule } from './promotion/PromotionModule.js';
import { pollUpcoming, pollFeeds } from './streamAlerts/YouTubeAlerts.js';

import { runGiveaways } from './jobs/giveaways.js';
import { checkBirthdays } from './jobs/birthdays.js';
import { runScheduledMessages } from './jobs/scheduledMessages.js';
import { updateStatsChannels } from './jobs/statsChannels.js';
import { runTempBanExpiry, runTempRoleExpiry } from './jobs/tempExpiry.js';
import { runReminders } from './jobs/reminders.js';
import { closePolls } from './jobs/polls.js';
import { runStreamAlerts } from './jobs/streamAlerts.js';
import { runLotteryDraw, runWeeklyHighlights, runWeeklyAnalytics } from './jobs/weekly.js';
import { postTopggStats, runTopggReminders } from './jobs/topgg.js';
import { runValorantSync, runVoiceXp, beatHeartbeat, runGuildPurgeSweep } from './jobs/system.js';

export class BackgroundJobs {
  private client: BotClient;
  private timers: NodeJS.Timeout[] = [];

  constructor(client: BotClient) {
    this.client = client;
  }

  start(): void {
    const jitter = () => Math.floor(Math.random() * 5_000);
    const c = this.client;

    void checkBirthdays(c);
    setTimeout(() => this.timers.push(setInterval(() => void checkBirthdays(c), 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void runValorantSync(c), 10 * 60 * 1000)), jitter());

    void PromotionModule.refresh();
    setTimeout(() => this.timers.push(setInterval(() => void PromotionModule.reconcile(c), 5 * 60 * 1000)), jitter());

    void runScheduledMessages(c);
    setTimeout(() => this.timers.push(setInterval(() => void runScheduledMessages(c), 60 * 1000)), jitter());

    void updateStatsChannels(c);
    setTimeout(() => this.timers.push(setInterval(() => void updateStatsChannels(c), 5 * 60 * 1000)), jitter());

    void runTempBanExpiry(c);
    setTimeout(() => this.timers.push(setInterval(() => void runTempBanExpiry(c), 60 * 1000)), jitter());

    void runTempRoleExpiry(c);
    setTimeout(() => this.timers.push(setInterval(() => void runTempRoleExpiry(c), 60 * 1000)), jitter());

    void runReminders(c);
    setTimeout(() => this.timers.push(setInterval(() => void runReminders(c), 60 * 1000)), jitter());

    void runGiveaways(c);
    setTimeout(() => this.timers.push(setInterval(() => void runGiveaways(c), 60 * 1000)), jitter());

    void closePolls(c);
    setTimeout(() => this.timers.push(setInterval(() => void closePolls(c), 60 * 1000)), jitter());

    void runStreamAlerts(c);
    setTimeout(() => this.timers.push(setInterval(() => void runStreamAlerts(c), 5 * 60 * 1000)), jitter());

    if (process.env.YOUTUBE_API_KEY) {
      setTimeout(() => this.timers.push(setInterval(() => void pollUpcoming().catch(() => {}), 90 * 1000)), jitter());
      setTimeout(() => this.timers.push(setInterval(() => void pollFeeds().catch(() => {}), 2 * 60 * 1000)), jitter());
    }

    setTimeout(() => this.timers.push(setInterval(() => void XPDecayModule.runDecay(), 24 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void AnalyticsModule.flushDailyStats(c), 24 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void runWeeklyAnalytics(c), 7 * 24 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void runWeeklyHighlights(c), 6 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void EventsModule.runReminders(c).catch(() => {}), 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void runLotteryDraw(c), 6 * 60 * 60 * 1000)), jitter());

    void runGuildPurgeSweep(c);
    setTimeout(() => this.timers.push(setInterval(() => void runGuildPurgeSweep(c), 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void runVoiceXp(c), 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void ModmailModule.closeIdleThreads(c), 15 * 60 * 1000)), jitter());

    void beatHeartbeat(c);
    this.timers.push(setInterval(() => void beatHeartbeat(c), 30 * 1000));

    if (process.env.TOPGG_TOKEN) {
      void postTopggStats(c);
      setTimeout(() => this.timers.push(setInterval(() => void postTopggStats(c), 30 * 60 * 1000)), jitter());
    } else {
      logger.info('TOPGG_TOKEN not set — skipping top.gg stats posting');
    }

    setTimeout(() => this.timers.push(setInterval(() => void runTopggReminders(c), 5 * 60 * 1000)), jitter());

    logger.info('Background jobs started (birthdays, scheduled messages, stats channels, temp bans, temp roles, reminders, giveaways, stream alerts, xp decay, analytics, weekly analytics, guild purge sweep, heartbeat, top.gg stats)');
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
