
import { EmbedBuilder, DiscordAPIError, type Guild } from 'discord.js';
import { getGuildSettings } from './settings.js';
import { resolveUserLocale, t } from '../i18n/index.js';
import { logger, swallow } from '../logger.js';

const PERMISSION_ERROR_CODES = new Set([50013, 50001]);
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

export function isPermissionError(err: unknown): boolean {
  if (err instanceof DiscordAPIError) return PERMISSION_ERROR_CODES.has(Number(err.code));
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' && PERMISSION_ERROR_CODES.has(code);
}

export interface ActionFailureOptions {

  action: string;

  error: unknown;

  requiredPermission?: string;

  channelId?: string | null;

  target?: string | null;
}

export async function notifyActionFailure(guild: Guild, opts: ActionFailureOptions): Promise<null> {
  const { action, error } = opts;

  logger.debug({ err: error, action, guildId: guild.id }, 'bot action failed');

  try {
    if (!isPermissionError(error)) return null;

    if (error && typeof error === 'object') {
      (error as { __arkenHandled?: boolean }).__arkenHandled = true;
    }

    const settings = await getGuildSettings(guild.id);
    if (!settings || settings.permissionAlertsEnabled === false) return null;

    const channelId = settings.modLogChannelId ?? settings.logChannelId;
    if (!channelId) return null;

    const key = `${guild.id}:${action}:${opts.channelId ?? ''}`;
    const now = Date.now();
    const last = lastAlertAt.get(key);
    if (last && now - last < DEDUPE_TTL_MS) return null;

    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return null;

    const loc = await resolveUserLocale({
      user: { id: '' },
      guildId: guild.id,
      guildLocale: guild.preferredLocale,
    });
    const roleId = settings.permissionAlertRoleId;

    const fields = [{ name: t('permAlert.fieldAction', loc), value: t(`permAlert.actions.${action}`, loc), inline: false }];
    if (opts.requiredPermission) fields.push({ name: t('permAlert.fieldPermission', loc), value: opts.requiredPermission, inline: true });
    if (opts.channelId) fields.push({ name: t('permAlert.fieldChannel', loc), value: `<#${opts.channelId}>`, inline: true });
    if (opts.target) fields.push({ name: t('permAlert.fieldTarget', loc), value: opts.target, inline: true });

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(t('permAlert.title', loc))
      .setDescription(t('permAlert.description', loc))
      .addFields(fields)
      .setFooter({ text: t('permAlert.footer', loc) })
      .setTimestamp();

    await channel
      .send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [embed],
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      })
      .catch(swallow);

    lastAlertAt.set(key, now);
  } catch (e) {
    logger.debug({ err: e }, 'notifyActionFailure internal error');
  }
  return null;
}
