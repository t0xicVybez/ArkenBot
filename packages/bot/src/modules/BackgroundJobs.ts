/**
 * Registrar for all recurring background jobs: sets up the intervals and runs
 * the time-sensitive ones once immediately. Each job's implementation lives in
 * its own module under ./jobs/ (P3 god-file split); this file only schedules.
 *
 * Call `start()` once the client is ready and `stop()` during graceful shutdown.
 */

import { logger } from '../logger.js';
import type { BotClient } from '../client.js';

// Jobs still owned by their own feature modules, invoked directly.
import { XPDecayModule } from './leveling/XPDecayModule.js';
import { EventsModule } from './events/EventsModule.js';
import { ModmailModule } from './modmail/ModmailModule.js';
import { AnalyticsModule } from './AnalyticsModule.js';
import { PromotionModule } from './promotion/PromotionModule.js';
import { pollUpcoming, pollFeeds } from './streamAlerts/YouTubeAlerts.js';

// Extracted scheduler jobs (./jobs/*).
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

  /**
   * Starts all background intervals. Each time-sensitive job (birthdays,
   * scheduled messages, temp ban expiry, reminders, giveaways) also runs once
   * immediately so events that occurred while the bot was offline are not missed.
   *
   * Intervals are registered with a small random jitter (0–5 s) so that on a
   * process restart every recurring job doesn't fire at the exact same wall-clock
   * second, which would create a brief spike of simultaneous DB and Redis load.
   */
  start(): void {
    const jitter = () => Math.floor(Math.random() * 5_000);
    const c = this.client;

    void checkBirthdays(c);
    setTimeout(() => this.timers.push(setInterval(() => void checkBirthdays(c), 60 * 60 * 1000)), jitter());

    // VALORANT rank sync + rank-roles + match alerts (batched to respect Riot
    // rate limits). No-ops entirely while the integration is unconfigured.
    setTimeout(() => this.timers.push(setInterval(() => void runValorantSync(c), 10 * 60 * 1000)), jitter());

    // Server promotion tracking: load enabled configs now (so the presence hot
    // path works immediately), then reconcile every 5 min to catch missed events.
    void PromotionModule.refresh();
    setTimeout(() => this.timers.push(setInterval(() => void PromotionModule.reconcile(c), 5 * 60 * 1000)), jitter());

    void runScheduledMessages(c);
    setTimeout(() => this.timers.push(setInterval(() => void runScheduledMessages(c), 60 * 1000)), jitter());

    // Stats channels are voice-channel renames — updates are rate-limited by Discord,
    // so 5-minute polling is a safe floor.
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

    // YouTube alerts: the primary detector is a quota-free poll of each channel's
    // public Atom feed (~2min) — reliable and independent of Google's WebSub hub;
    // WebSub push, when the hub is healthy, just wins the race for near-instant
    // delivery (deduped). pollUpcoming (~90s) carries scheduled streams to go-live.
    if (process.env.YOUTUBE_API_KEY) {
      setTimeout(() => this.timers.push(setInterval(() => void pollUpcoming().catch(() => {}), 90 * 1000)), jitter());
      setTimeout(() => this.timers.push(setInterval(() => void pollFeeds().catch(() => {}), 2 * 60 * 1000)), jitter());
    }

    setTimeout(() => this.timers.push(setInterval(() => void XPDecayModule.runDecay(), 24 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void AnalyticsModule.flushDailyStats(c), 24 * 60 * 60 * 1000)), jitter());

    // Weekly analytics reports — fire every 7 days, but only actually post on
    // Mondays (UTC) so restarts mid-week don't double-post.
    setTimeout(() => this.timers.push(setInterval(() => void runWeeklyAnalytics(c), 7 * 24 * 60 * 60 * 1000)), jitter());

    // Weekly community highlights digest (Monday-gated).
    setTimeout(() => this.timers.push(setInterval(() => void runWeeklyHighlights(c), 6 * 60 * 60 * 1000)), jitter());

    // Event RSVP reminders (every minute).
    setTimeout(() => this.timers.push(setInterval(() => void EventsModule.runReminders(c).catch(() => {}), 60 * 1000)), jitter());

    // Weekly economy lottery draw (Sunday-gated).
    setTimeout(() => this.timers.push(setInterval(() => void runLotteryDraw(c), 6 * 60 * 60 * 1000)), jitter());

    // Purge data for guilds that left longer than the grace period ago.
    void runGuildPurgeSweep(c);
    setTimeout(() => this.timers.push(setInterval(() => void runGuildPurgeSweep(c), 60 * 60 * 1000)), jitter());

    // Voice XP: award to eligible members in voice once a minute.
    setTimeout(() => this.timers.push(setInterval(() => void runVoiceXp(c), 60 * 1000)), jitter());

    // Auto-close idle modmail threads every 15 minutes.
    setTimeout(() => this.timers.push(setInterval(() => void ModmailModule.closeIdleThreads(c), 15 * 60 * 1000)), jitter());

    // Heartbeat for the public status page — the API reads this key.
    void beatHeartbeat(c);
    this.timers.push(setInterval(() => void beatHeartbeat(c), 30 * 1000));

    // Server count on the top.gg listing — only when a token is configured.
    if (process.env.TOPGG_TOKEN) {
      void postTopggStats(c);
      setTimeout(() => this.timers.push(setInterval(() => void postTopggStats(c), 30 * 60 * 1000)), jitter());
    } else {
      logger.info('TOPGG_TOKEN not set — skipping top.gg stats posting');
    }

    // "You can vote again" DM reminders for opted-in voters.
    setTimeout(() => this.timers.push(setInterval(() => void runTopggReminders(c), 5 * 60 * 1000)), jitter());

    logger.info('Background jobs started (birthdays, scheduled messages, stats channels, temp bans, temp roles, reminders, giveaways, stream alerts, xp decay, analytics, weekly analytics, guild purge sweep, heartbeat, top.gg stats)');
  }

  /** Clears all active intervals. Call during graceful shutdown. */
  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
