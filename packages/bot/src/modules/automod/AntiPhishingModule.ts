

/**
 * Anti-phishing. Scans message links against a blocklist of known scam/phishing
 * domains and acts (delete/warn/ban per config) on a match. The blocklist is
 * fetched from a public feed and cached in Redis, refreshed hourly, so every
 * message check is a fast in-memory/Redis lookup.
 */
import { type Message, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { logger, swallow} from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import axios from 'axios';

const BLOCKLIST_REDIS_KEY = 'antiphishing:domains';
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const CACHE_TTL_SECONDS = 4 * 60 * 60; // outlives REFRESH_INTERVAL_MS so one missed hourly refresh doesn't drop the fallback

let domainSet = new Set<string>();
let lastRefreshed = 0;
let lastRefreshAttempt = 0;

async function refreshBlocklist(): Promise<void> {
  lastRefreshAttempt = Date.now();
  try {
    const res = await axios.get<string[]>('https://phish.sinking.yachts/v2/all', {
      headers: { 'X-Identity': 'ArkenBot anti-phishing (https://arkenbot.app)' },
      timeout: 10_000,
    });
    if (Array.isArray(res.data)) {
      domainSet = new Set(res.data.map((d) => d.toLowerCase().trim()));
      lastRefreshed = Date.now();

      await redis.setex(BLOCKLIST_REDIS_KEY, CACHE_TTL_SECONDS, JSON.stringify([...domainSet]));
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
    } catch {  }
  }
}

void refreshBlocklist();
setInterval(() => void refreshBlocklist(), REFRESH_INTERVAL_MS).unref();

const URL_REGEX = /https?:\/\/([a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;

function extractDomains(content: string): string[] {
  const domains: string[] = [];
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(content)) !== null) {
    try {
      const url = new URL(match[0]);
      domains.push(url.hostname.toLowerCase().replace(/^www\./, ''));
    } catch {  }
  }
  return domains;
}

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

export class AntiPhishingModule {
  static async analyze(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    if (!message.content) return;

    const config = await getConfig(message.guild.id);
    if (!config?.antiPhishingEnabled) return;

    if (
      (domainSet.size === 0 || Date.now() - lastRefreshed > REFRESH_INTERVAL_MS * 2) &&
      Date.now() - lastRefreshAttempt > RETRY_COOLDOWN_MS
    ) {
      await refreshBlocklist();
    }

    if (domainSet.size === 0) return;

    const member = message.member;
    if (!member) return;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    if (config.exemptRoles?.some((r) => member.roles.cache.has(r))) return;
    if (config.exemptChannels?.includes(message.channelId)) return;

    const domains = extractDomains(message.content);
    const hit = domains.find((d) => domainSet.has(d));
    if (!hit) return;

    logger.warn({ guildId: message.guild.id, userId: message.author.id, domain: hit }, 'Phishing domain detected');

    await message.delete().catch((e) => notifyActionFailure(message.guild!, { action: 'automodDelete', error: e, requiredPermission: 'Manage Messages', channelId: message.channelId, target: message.author.toString() }));

    const channel = message.channel;
    if ('send' in channel) {
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: message.guild.id, guildLocale: message.guild.preferredLocale });
      const warning = await (channel as import('discord.js').TextChannel)
        .send(t('automod.phishingRemoved', loc, { user: `<@${message.author.id}>` }))
        .catch(swallow);
      if (warning) setTimeout(() => warning.delete().catch(swallow), 8_000);
    }

    if (config.antiPhishingAction === 'delete_mute') {
      await member
        .disableCommunicationUntil(Date.now() + 10 * 60 * 1000, 'Anti-phishing: sent a phishing link')
        .catch((e) => notifyActionFailure(message.guild!, { action: 'automodTimeout', error: e, requiredPermission: 'Timeout Members', channelId: message.channelId, target: message.author.toString() }));
    }
  }
}
