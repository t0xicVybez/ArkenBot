import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SHIPPED = ['en-US','es-ES','fr','de','pt-BR','ru','ja','ko','it','pl','zh-CN'];

/** Flatten a nested catalog into dotted keys (arrays indexed) → string leaves. */
function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof obj === 'string') {
    out[prefix] = obj;
  }
  return out;
}

const load = (p: string) => flatten(JSON.parse(readFileSync(p, 'utf8')));
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

describe('bot i18n catalogs', () => {
  const dir = join(__dirname, '../../packages/bot/src/i18n/locales');
  const en = load(join(dir, 'en-US.json'));
  const enKeys = Object.keys(en);

  it('ships exactly the 11 expected locale files', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    expect(files.sort()).toEqual([...SHIPPED].sort());
  });

  for (const loc of SHIPPED.filter((l) => l !== 'en-US')) {
    describe(loc, () => {
      const cat = load(join(dir, `${loc}.json`));
      it('has no missing or extra keys vs en-US', () => {
        const missing = enKeys.filter((k) => !(k in cat));
        const extra = Object.keys(cat).filter((k) => !(k in en));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });
      it('keeps the same {placeholders} as en-US', () => {
        const mismatches = enKeys
          .filter((k) => k in cat)
          .map((k) => ({ k, en: [...placeholders(en[k])].sort(), loc: [...placeholders(cat[k])].sort() }))
          .filter((m) => m.en.join(',') !== m.loc.join(','));
        expect(mismatches).toEqual([]);
      });
    });
  }
});

describe('web i18n catalogs', () => {
  const dir = join(__dirname, '../../packages/web/messages');
  const en = load(join(dir, 'en-US.json'));
  const enKeys = Object.keys(en);

  for (const loc of SHIPPED.filter((l) => l !== 'en-US')) {
    it(`${loc} has no missing or extra keys vs en-US`, () => {
      const cat = load(join(dir, `${loc}.json`));
      const missing = enKeys.filter((k) => !(k in cat));
      const extra = Object.keys(cat).filter((k) => !(k in en));
      expect({ loc, missing, extra }).toEqual({ loc, missing: [], extra: [] });
    });
  }
});
