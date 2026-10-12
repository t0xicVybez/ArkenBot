/**
 * Turns Discord permission errors into admin alerts, bot-wide.
 *
 * Rather than making every feature remember to catch "Missing Permissions", we
 * wrap the client's REST layer once. When any Discord API call fails with a
 * permission error, we work out which guild/channel and what kind of action it
 * was, and hand that to `notifyActionFailure` so the server's admins get told
 * what the bot couldn't do and why. The original error is always re-thrown, so
 * callers still behave exactly as before.
 */
import { DiscordAPIError, type Client, type Guild } from 'discord.js';
import { isPermissionError, notifyActionFailure } from './permissionAlert.js';
import { logger } from '../logger.js';

// Audit-log reads fail for benign reasons (no View Audit Log) all the time and
// would be noisy, so we never alert on them.
function isSilencedEndpoint(url: string): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  return /\/guilds\/\d+\/audit-logs$/.test(path);
}

// Pull the guild/channel IDs out of the failed request's URL so we know where
// to send the alert.
function extractIds(url: string): { guildId?: string; channelId?: string } {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return {
    guildId: path.match(/\/guilds\/(\d+)/)?.[1],
    channelId: path.match(/\/channels\/(\d+)/)?.[1],
  };
}

// Map an HTTP method + API path to a friendly action id and the permission it
// most likely needs, so the alert can say "couldn't ban — needs Ban Members".
function classify(method: string, url: string): { action: string; requiredPermission?: string } {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const m = method.toUpperCase();

  if (/\/channels\/\d+\/messages$/.test(path) && m === 'POST') return { action: 'sendMessage', requiredPermission: 'Send Messages / Embed Links' };
  if (/\/channels\/\d+\/messages\/\d+$/.test(path) && m === 'DELETE') return { action: 'deleteMessage', requiredPermission: 'Manage Messages' };
  if (/\/channels\/\d+\/messages\/bulk-delete$/.test(path)) return { action: 'manageMessages', requiredPermission: 'Manage Messages' };
  if (/\/channels\/\d+\/messages\/\d+$/.test(path) && m === 'PATCH') return { action: 'manageMessages', requiredPermission: 'Manage Messages' };
  if (/\/channels\/\d+\/pins\//.test(path)) return { action: 'manageMessages', requiredPermission: 'Manage Messages' };
  if (/\/channels\/\d+\/messages\/\d+\/reactions\//.test(path) && m === 'PUT') return { action: 'addReaction', requiredPermission: 'Add Reactions' };

  if (/\/guilds\/\d+\/members\/\d+\/roles\/\d+$/.test(path)) return { action: 'manageRoles', requiredPermission: 'Manage Roles' };
  if (/\/guilds\/\d+\/bans\/\d+$/.test(path) && m === 'PUT') return { action: 'ban', requiredPermission: 'Ban Members' };
  if (/\/guilds\/\d+\/members\/\d+$/.test(path) && m === 'DELETE') return { action: 'kick', requiredPermission: 'Kick Members' };
  if (/\/guilds\/\d+\/members\/(?:\d+|@me)$/.test(path) && m === 'PATCH') return { action: 'memberUpdate', requiredPermission: 'Timeout Members / Manage Nicknames' };

  if (/\/channels\/\d+\/permissions\//.test(path)) return { action: 'manageChannels', requiredPermission: 'Manage Roles / Manage Channels' };
  if (/\/channels\/\d+$/.test(path) && (m === 'PATCH' || m === 'DELETE')) return { action: 'manageChannels', requiredPermission: 'Manage Channels' };
  if (/\/guilds\/\d+\/channels$/.test(path) && m === 'POST') return { action: 'manageChannels', requiredPermission: 'Manage Channels' };

  if (/\/guilds\/\d+$/.test(path) && m === 'PATCH') return { action: 'manageServer', requiredPermission: 'Manage Server' };
  if (/\/webhooks\//.test(path) || /\/channels\/\d+\/webhooks$/.test(path)) return { action: 'manageWebhooks', requiredPermission: 'Manage Webhooks' };

  return { action: 'generic' };
}

export function installRestErrorInterceptor(client: Client): void {
  const rest = client.rest as unknown as { request: (...args: unknown[]) => Promise<unknown> };
  const original = rest.request.bind(rest);

  rest.request = async (...args: unknown[]): Promise<unknown> => {
    try {
      return await original(...args);
    } catch (err) {
      if (isPermissionError(err) && err instanceof DiscordAPIError && typeof err.url === 'string' && !isSilencedEndpoint(err.url)) {
        const captured = err;

        // Fire the alert on the next tick so we don't delay re-throwing the
        // error to the caller. `__arkenHandled` lets a feature that already
        // handled this specific error suppress the duplicate alert.
        setTimeout(() => {
          try {
            if ((captured as { __arkenHandled?: boolean }).__arkenHandled) return;
            const { guildId, channelId } = extractIds(captured.url);
            let guild: Guild | undefined = guildId ? client.guilds.cache.get(guildId) : undefined;
            if (!guild && channelId) {
              const ch = client.channels.cache.get(channelId) as { guild?: Guild } | undefined;
              guild = ch?.guild;
            }
            if (!guild) return;
            const { action, requiredPermission } = classify(captured.method ?? 'GET', captured.url);
            void notifyActionFailure(guild, { action, error: captured, requiredPermission, channelId: channelId ?? null });
          } catch (e) {
            logger.debug({ err: e }, 'REST interceptor alert failed');
          }
        }, 0);
      }
      // Always propagate the original error — the interceptor only observes.
      throw err;
    }
  };

  logger.info('REST permission-error interceptor installed');
}
