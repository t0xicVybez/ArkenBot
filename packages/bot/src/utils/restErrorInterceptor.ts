/**
 * Global REST permission-error interceptor.
 *
 * Every Discord API call the bot makes flows through `client.rest.request`.
 * This wraps it so that ANY request rejected with a missing-permission error
 * (50013 / 50001), anywhere in the bot, produces an admin alert — recovering the
 * guild/channel and the attempted operation from the request URL. This is the
 * catch-all so no action needs to be wired individually.
 *
 * It fires as a *fallback*: call sites that already alert (see
 * `notifyActionFailure`) mark the error as handled, and this interceptor skips
 * those so their more specific labels win and no alert is duplicated.
 */
import { DiscordAPIError, type Client, type Guild } from 'discord.js';
import { isPermissionError, notifyActionFailure } from './permissionAlert.js';
import { logger } from '../logger.js';

/** Recover the guild and channel snowflakes from a Discord API URL. */
function extractIds(url: string): { guildId?: string; channelId?: string } {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return {
    guildId: path.match(/\/guilds\/(\d+)/)?.[1],
    channelId: path.match(/\/channels\/(\d+)/)?.[1],
  };
}

/** Map an API method + path to a friendly action id (i18n key) and the likely permission. */
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

/** Wrap `client.rest.request` so every permission failure surfaces an alert. */
export function installRestErrorInterceptor(client: Client): void {
  const rest = client.rest as unknown as { request: (...args: unknown[]) => Promise<unknown> };
  const original = rest.request.bind(rest);

  rest.request = async (...args: unknown[]): Promise<unknown> => {
    try {
      return await original(...args);
    } catch (err) {
      if (isPermissionError(err) && err instanceof DiscordAPIError && typeof err.url === 'string') {
        const captured = err;
        // Defer to a macrotask so a call-site handler (which marks the error)
        // runs first; only alert here if nothing else did.
        setTimeout(() => {
          try {
            if ((captured as { __arkenHandled?: boolean }).__arkenHandled) return;
            const { guildId, channelId } = extractIds(captured.url);
            let guild: Guild | undefined = guildId ? client.guilds.cache.get(guildId) : undefined;
            if (!guild && channelId) {
              const ch = client.channels.cache.get(channelId) as { guild?: Guild } | undefined;
              guild = ch?.guild;
            }
            if (!guild) return; // DM or uncached guild — nothing to alert
            const { action, requiredPermission } = classify(captured.method ?? 'GET', captured.url);
            void notifyActionFailure(guild, { action, error: captured, requiredPermission, channelId: channelId ?? null });
          } catch (e) {
            logger.debug({ err: e }, 'REST interceptor alert failed');
          }
        }, 0);
      }
      throw err;
    }
  };

  logger.info('REST permission-error interceptor installed');
}
