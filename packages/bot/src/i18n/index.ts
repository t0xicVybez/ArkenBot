/**
 * Bot-side internationalization.
 *
 * `t(key, locale, vars)` looks up a dot-path translation key for the given
 * locale, falling back to the default locale, then to the key itself. Message
 * files live in `./locales/<locale>.json` and are loaded once at startup.
 *
 * `resolveUserLocale(interaction)` decides which language to reply in:
 *   1. the user's explicit preference (`/language`, stored in UserPreferences)
 *   2. the user's Discord client locale (`interaction.locale`)
 *   3. the guild's configured locale
 *   4. the guild's Discord locale, else the default locale
 */
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveLocale, DEFAULT_LOCALE } from '@arkenbot/shared';
import { prisma } from '../database.js';
import { getGuildSettings } from '../utils/settings.js';
import { logger } from '../logger.js';

type Messages = Record<string, unknown>;

const localesDir = join(dirname(fileURLToPath(import.meta.url)), 'locales');
const messages: Record<string, Messages> = {};

try {
  for (const file of readdirSync(localesDir)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue; // skip _meta.json
    const code = file.slice(0, -'.json'.length);
    messages[code] = JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as Messages;
  }
  logger.info({ locales: Object.keys(messages).length }, 'i18n: loaded locale message files');
} catch (err) {
  logger.warn({ err }, 'i18n: failed to load locale files — falling back to keys');
}

function lookup(msgs: Messages | undefined, key: string): string | undefined {
  if (!msgs) return undefined;
  let cur: unknown = msgs;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Translate `key` into `locale`. Interpolates `{name}` placeholders from `vars`.
 * Falls back: requested locale -> default locale -> the key itself (so a missing
 * translation is visible but never crashes).
 */
export function t(key: string, locale: string, vars?: Record<string, string | number>): string {
  const loc = resolveLocale(locale);
  let str = lookup(messages[loc], key) ?? lookup(messages[DEFAULT_LOCALE], key) ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

interface LocaleResolvable {
  user: { id: string };
  locale?: string | null;
  guildId?: string | null;
  guildLocale?: string | null;
}

/** Resolves the locale to respond in for a given interaction. See file header. */
export async function resolveUserLocale(interaction: LocaleResolvable): Promise<string> {
  const pref = await prisma.userPreferences
    .findUnique({ where: { userId: interaction.user.id }, select: { language: true } })
    .catch(() => null);
  if (pref?.language) return resolveLocale(pref.language);

  if (interaction.locale) return resolveLocale(interaction.locale);

  if (interaction.guildId) {
    const settings = await getGuildSettings(interaction.guildId).catch(() => null);
    if (settings?.locale) return resolveLocale(settings.locale);
  }

  return resolveLocale(interaction.guildLocale ?? DEFAULT_LOCALE);
}
