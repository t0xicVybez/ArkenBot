/**
 * Translates slash-command metadata for Discord's command picker.
 *
 * Command and option *names* stay English, but their descriptions and choice
 * labels can be localized per viewer. The translations live in
 * `command-meta.json` (keyed by the original English string); at registration
 * time we walk a command's JSON and attach `*_localizations` maps wherever we
 * have translations. If the file is missing, the picker simply stays English.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

type LocaleMap = Record<string, string>;
type MetaDict = Record<string, LocaleMap>;

// English string -> { locale: translation }. Loaded once at module load.
let dict: MetaDict = {};
try {
  const p = join(dirname(fileURLToPath(import.meta.url)), 'command-meta.json');
  dict = JSON.parse(readFileSync(p, 'utf8')) as MetaDict;
  logger.info({ entries: Object.keys(dict).length }, 'i18n: loaded command-meta localizations');
} catch (err) {
  logger.warn({ err }, 'i18n: command-meta.json missing — command picker stays English');
}

// Discord caps localized strings at 100 characters.
function clamp(v: string): string {
  return v.length > 100 ? v.slice(0, 100) : v;
}

// Look up every translation for one English string, or undefined if none.
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

// Localize an option's description and its choice labels, recursing into
// sub-options (subcommands and groups).
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
 * Attach localization maps to a command's JSON in place and return it. Call
 * this on each command right before registering it with Discord.
 */
export function localizeCommandJSON<T>(json: T): T {
  const j = json as { description?: string; description_localizations?: LocaleMap; options?: OptionJSON[] };
  const dl = localizeMap(j.description);
  if (dl) j.description_localizations = dl;
  localizeOptions(j.options);
  return json;
}
