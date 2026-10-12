/**
 * Sends "the bot couldn't do that" alerts to a server's mod-log.
 *
 * When a bot action fails because of a missing Discord permission, this posts a
 * localized embed to the guild's configured log channel (optionally pinging an
 * alert role) so admins can fix the permission. Alerts are opt-out per guild and
 * de-duplicated so one misconfiguration doesn't spam the channel.
 *
 * Features can call `notifyActionFailure` directly, but most permission errors
 * are caught automatically by the REST interceptor (see restErrorInterceptor.ts).
 */
import { EmbedBuilder, DiscordAPIError, type Guild } from 'discord.js';
import { getGuildSettings } from './settings.js';
import { resolveUserLocale, t } from '../i18n/index.js';
import { logger, swallow } from '../logger.js';

// 50013 = Missing Permissions, 50001 = Missing Access.
const PERMISSION_ERROR_CODES = new Set([50013, 50001]);
// Only alert once per guild/action/channel every 10 minutes.
const DEDUPE_TTL_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

export function isPermissionError(err: unknown): boolean {
  if (err instanceof DiscordAPIError) return PERMISSION_ERROR_CODES.has(Number(err.code));
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' && PERMISSION_ERROR_CODES.has(code);
}

export interface ActionFailureOptions {
  // Friendly action id, mapped to a localized label (e.g. 'ban', 'sendMessage').
  action: string;
  // The original error that was thrown.
  error: unknown;
  // Human-readable permission the action needs, shown in the alert.
  requiredPermission?: string;
  // Channel the action targeted, if any (linked in the alert).
  channelId?: string | null;
  // The user/role/thing acted upon, if any.
  target?: string | null;
}

export async function notifyActionFailure(guild: Guild, opts: ActionFailureOptions): Promise<null> {
  const { action, error } = opts;

  logger.debug({ err: error, action, guildId: guild.id }, 'bot action failed');

  try {
    // Only permission errors are worth alerting about.
    if (!isPermissionError(error)) return null;

    // Mark the error so the REST interceptor won't also alert on it.
    if (error && typeof error === 'object') {
      (error as { __arkenHandled?: boolean }).__arkenHandled = true;
    }

    const settings = await getGuildSettings(guild.id);
    if (!settings || settings.permissionAlertsEnabled === false) return null;

    // Prefer the dedicated mod-log channel, falling back to the general log.
    const channelId = settings.modLogChannelId ?? settings.logChannelId;
    if (!channelId) return null;

    // Skip if we alerted about this same thing recently.
    const key = `${guild.id}:${action}:${opts.channelId ?? ''}`;
    const now = Date.now();
    const last = lastAlertAt.get(key);
    if (last && now - last < DEDUPE_TTL_MS) return null;

    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return null;

    // Alerts are server-facing, so localize to the guild's language.
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
        // Only ping the alert role, never @everyone/@here from an error.
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      })
      .catch(swallow);

    lastAlertAt.set(key, now);
  } catch (e) {
    // This is itself an error handler; never let it throw.
    logger.debug({ err: e }, 'notifyActionFailure internal error');
  }
  return null;
}
