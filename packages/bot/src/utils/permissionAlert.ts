/**
 * Permission-failure alerts.
 *
 * When the bot is blocked from performing an action by a missing Discord
 * permission (or role-hierarchy) it normally fails silently via `.catch(swallow)`.
 * `notifyActionFailure` is a drop-in replacement for `swallow` in those `.catch`
 * handlers: it preserves the swallow behaviour (debug-log, return null, never
 * throw) but, when the error is a permission error, also posts an alert to the
 * guild's mod-log/log channel pinging the configured alert role.
 *
 * Alerts are de-duplicated per guild + action for a short window so a
 * misconfigured server gets one heads-up, not a flood.
 */
import { EmbedBuilder, DiscordAPIError, type Guild } from 'discord.js';
import { getGuildSettings } from './settings.js';
import { resolveUserLocale, t } from '../i18n/index.js';
import { logger, swallow } from '../logger.js';

/** Discord API error codes that mean "the bot lacks permission to do this". */
const PERMISSION_ERROR_CODES = new Set([50013, 50001]); // Missing Permissions, Missing Access
const DEDUPE_TTL_MS = 10 * 60 * 1000; // one alert per guild+action per 10 minutes
const lastAlertAt = new Map<string, number>();

/** True when `err` is a Discord "missing permission / access" error. */
export function isPermissionError(err: unknown): boolean {
  if (err instanceof DiscordAPIError) return PERMISSION_ERROR_CODES.has(Number(err.code));
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' && PERMISSION_ERROR_CODES.has(code);
}

export interface ActionFailureOptions {
  /** Action id — used both as the dedupe key and the `permAlert.actions.<id>` i18n key. */
  action: string;
  /** The caught error. */
  error: unknown;
  /** Human-readable permission the bot likely needs, e.g. "Timeout Members". */
  requiredPermission?: string;
  /** Where the action was attempted (rendered as a channel mention). */
  channelId?: string | null;
  /** Who/what the action targeted (mention or tag). */
  target?: string | null;
}

/**
 * Drop-in `.catch()` handler. Always returns null and never throws, so it does
 * not change control flow. Emits a permission alert when the error is a
 * missing-permission error and the guild has a mod-log/log channel configured.
 */
export async function notifyActionFailure(guild: Guild, opts: ActionFailureOptions): Promise<null> {
  const { action, error } = opts;
  // Preserve swallow's behaviour first, whatever happens next.
  logger.debug({ err: error, action, guildId: guild.id }, 'bot action failed');

  try {
    if (!isPermissionError(error)) return null;

    // Mark the error so the global REST interceptor treats this as already handled
    // (it fires only as a fallback for actions without a call-site handler).
    if (error && typeof error === 'object') {
      (error as { __arkenHandled?: boolean }).__arkenHandled = true;
    }

    const settings = await getGuildSettings(guild.id);
    if (!settings || settings.permissionAlertsEnabled === false) return null;

    const channelId = settings.modLogChannelId ?? settings.logChannelId;
    if (!channelId) return null;

    // De-duplicate: one alert per guild+action+channel per window.
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
