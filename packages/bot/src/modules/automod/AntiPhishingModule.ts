/**
 * Scans messages for known phishing / scam domains. Maintains an in-memory
 * blocklist that is refreshed hourly from a public phishing-domain feed.
 *
 * On a match the offending message is deleted. If the config action is
 * "delete_mute" the author is also timed-out for 10 minutes.
 */

import { type Message, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { logger, swallow} from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import axios from 'axios';

const BLOCKLIST_REDIS_KEY = 'antiphishing:domains';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ── Domain blocklist ──────────────────────────────────────────────────────────

let domainSet = new Set<string>();
let lastRefreshed = 0;

async function refreshBlocklist(): Promise<void> {
  try {
    const res = await axios.get<string[]>('https://phish.sinking.yachts/v2/all', {
      headers: { 'X-Identity': 'ArkenBot anti-phishing (https://arkenbot.app)' },
      timeout: 10_000,
    });
    if (Array.isArray(res.data)) {
      domainSet = new Set(res.data.map((d) => d.toLowerCase().trim()));
      lastRefreshed = Date.now();
      // Cache in Redis so other processes can read it (TTL 90 min)
      await redis.setex(BLOCKLIST_REDIS_KEY, 5400, JSON.stringify([...domainSet]));
      logger.info({ count: domainSet.size }, 'Anti-phishing blocklist refreshed');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to refresh anti-phishing blocklist; trying Redis cache');
    try {
      const cached = await redis.get(BLOCKLIST_REDIS_KEY);
      if (cached) {
        domainSet = new Set(JSON.parse(cached) as string[]);
        lastRefreshed = Date.now();
      }
    } catch { /* keep previous in-memory set */ }
  }
}

// Bootstrap on first import; subsequent refreshes happen on a timer.
void refreshBlocklist();
setInterval(() => void refreshBlocklist(), REFRESH_INTERVAL_MS).unref();

// ── URL extraction ────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/([a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;

function extractDomains(content: string): string[] {
  const domains: string[] = [];
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(content)) !== null) {
    try {
      const url = new URL(match[0]);
      domains.push(url.hostname.toLowerCase().replace(/^www\./, ''));
    } catch { /* invalid URL */ }
  }
  return domains;
}

// ── Config cache ──────────────────────────────────────────────────────────────

interface PhishingConfig {
  antiPhishingEnabled: boolean;
  antiPhishingAction: string;
  exemptRoles: string[];
  exemptChannels: string[];
}

async function getConfig(guildId: string): Promise<PhishingConfig | null> {
  const cached = await redis.get(`automod:config:${guildId}`);
  if (cached) {
    const c = JSON.parse(cached) as PhishingConfig;
    return c;
  }
  const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
  return config as PhishingConfig | null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class AntiPhishingModule {
  static async analyze(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    if (!message.content) return;

    const config = await getConfig(message.guild.id);
    if (!config?.antiPhishingEnabled) return;

    // Ensure blocklist is populated (may still be loading on first run)
    if (domainSet.size === 0 || Date.now() - lastRefreshed > REFRESH_INTERVAL_MS * 2) {
      await refreshBlocklist();
    }

    if (domainSet.size === 0) return;

    const member = message.member;
    if (!member) return;

    // Admins and exempt roles/channels are skipped
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    if (config.exemptRoles?.some((r) => member.roles.cache.has(r))) return;
    if (config.exemptChannels?.includes(message.channelId)) return;

    const domains = extractDomains(message.content);
    const hit = domains.find((d) => domainSet.has(d));
    if (!hit) return;

    logger.warn({ guildId: message.guild.id, userId: message.author.id, domain: hit }, 'Phishing domain detected');

    // Delete the message
    await message.delete().catch((e) => notifyActionFailure(message.guild!, { action: 'automodDelete', error: e, requiredPermission: 'Manage Messages', channelId: message.channelId, target: message.author.toString() }));

    // Warn the user in-channel (brief ephemeral-style message that deletes itself)
    const channel = message.channel;
    if ('send' in channel) {
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: message.guild.id, guildLocale: message.guild.preferredLocale });
      const warning = await (channel as import('discord.js').TextChannel)
        .send(t('automod.phishingRemoved', loc, { user: `<@${message.author.id}>` }))
        .catch(swallow);
      if (warning) setTimeout(() => warning.delete().catch(swallow), 8_000);
    }

    // Optionally mute (10-minute Discord timeout)
    if (config.antiPhishingAction === 'delete_mute') {
      await member
        .disableCommunicationUntil(Date.now() + 10 * 60 * 1000, 'Anti-phishing: sent a phishing link')
        .catch((e) => notifyActionFailure(message.guild!, { action: 'automodTimeout', error: e, requiredPermission: 'Timeout Members', channelId: message.channelId, target: message.author.toString() }));
    }
  }
}
