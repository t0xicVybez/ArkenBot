/**
 * Discord command-metadata localization.
 *
 * Discord localizes the slash-command PICKER (command + option descriptions and
 * choice display names) through `*_localizations` dictionaries on the command
 * JSON, keyed by Discord locale code and shown according to the viewer's Discord
 * client language. This is separate from the runtime `t()` system (which follows
 * the user's `arken_locale` preference and translates the bot's actual replies).
 *
 * `command-meta.json` maps each English source string -> { <discordLocale>: translation }.
 * `localizeCommandJSON` walks a built command's JSON and injects the localization
 * dictionaries in place. Command and option NAMES are intentionally left canonical
 * (English): Discord restricts them to a lowercase token charset that most
 * translations cannot satisfy, and stable names keep docs/support unambiguous.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

type LocaleMap = Record<string, string>;
type MetaDict = Record<string, LocaleMap>;

let dict: MetaDict = {};
try {
  const p = join(dirname(fileURLToPath(import.meta.url)), 'command-meta.json');
  dict = JSON.parse(readFileSync(p, 'utf8')) as MetaDict;
  logger.info({ entries: Object.keys(dict).length }, 'i18n: loaded command-meta localizations');
} catch (err) {
  logger.warn({ err }, 'i18n: command-meta.json missing — command picker stays English');
}

/** Discord rejects localization values longer than 100 chars; clamp defensively. */
function clamp(v: string): string {
  return v.length > 100 ? v.slice(0, 100) : v;
}

function localizeMap(source: string | undefined): LocaleMap | undefined {
  if (!source) return undefined;
  const entry = dict[source];
  if (!entry) return undefined;
  const out: LocaleMap = {};
  for (const [loc, val] of Object.entries(entry)) if (val) out[loc] = clamp(val);
  return Object.keys(out).length ? out : undefined;
}

interface OptionJSON {
  description?: string;
  description_localizations?: LocaleMap;
  choices?: Array<{ name: string; name_localizations?: LocaleMap }>;
  options?: OptionJSON[];
}

function localizeOptions(options: OptionJSON[] | undefined): void {
  for (const o of options ?? []) {
    const dl = localizeMap(o.description);
    if (dl) o.description_localizations = dl;
    for (const c of o.choices ?? []) {
      const nl = localizeMap(c.name);
      if (nl) c.name_localizations = nl;
    }
    if (o.options) localizeOptions(o.options);
  }
}

/**
 * Inject Discord localization dictionaries into a command's JSON (mutates and
 * returns it). Safe no-op for strings absent from the dictionary — they stay English.
 * Accepts any command body (chat-input or context-menu); context menus have no
 * `description`/`options`, so those branches simply do nothing.
 */
export function localizeCommandJSON<T>(json: T): T {
  const j = json as { description?: string; description_localizations?: LocaleMap; options?: OptionJSON[] };
  const dl = localizeMap(j.description);
  if (dl) j.description_localizations = dl;
  localizeOptions(j.options);
  return json;
}
