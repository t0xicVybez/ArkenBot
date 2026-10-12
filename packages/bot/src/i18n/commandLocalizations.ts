
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

export function localizeCommandJSON<T>(json: T): T {
  const j = json as { description?: string; description_localizations?: LocaleMap; options?: OptionJSON[] };
  const dl = localizeMap(j.description);
  if (dl) j.description_localizations = dl;
  localizeOptions(j.options);
  return json;
}
