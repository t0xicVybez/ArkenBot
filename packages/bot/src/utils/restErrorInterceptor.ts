
import { DiscordAPIError, type Client, type Guild } from 'discord.js';
import { isPermissionError, notifyActionFailure } from './permissionAlert.js';
import { logger } from '../logger.js';

function isSilencedEndpoint(url: string): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  return /\/guilds\/\d+\/audit-logs$/.test(path);
}

function extractIds(url: string): { guildId?: string; channelId?: string } {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return {
    guildId: path.match(/\/guilds\/(\d+)/)?.[1],
    channelId: path.match(/\/channels\/(\d+)/)?.[1],
  };
}

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
      throw err;
    }
  };

  logger.info('REST permission-error interceptor installed');
}
