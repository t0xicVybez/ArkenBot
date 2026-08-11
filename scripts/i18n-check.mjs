// Validate a translated catalog against the en-US base: identical key set and
// identical placeholder ({...}) multiset in every string. Usage:
//   node scripts/i18n-check.mjs <base.json> <translated.json>
import { readFileSync } from 'fs';

const [, , basePath, transPath] = process.argv;
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const trans = JSON.parse(readFileSync(transPath, 'utf8'));

function flat(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key] = String(v);
  }
  return out;
}
const fb = flat(base), ft = flat(trans);
const ph = (s) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(',');

let problems = 0;
for (const k of Object.keys(fb)) {
  if (!(k in ft)) { console.log(`MISSING  ${k}`); problems++; continue; }
  if (ph(fb[k]) !== ph(ft[k])) { console.log(`PLACEHOLDER  ${k}\n  en: ${ph(fb[k])}\n  tr: ${ph(ft[k])}`); problems++; }
}
for (const k of Object.keys(ft)) if (!(k in fb)) { console.log(`EXTRA    ${k}`); problems++; }

console.log(problems === 0
  ? `OK  ${transPath.split('/').pop()} — ${Object.keys(ft).length} keys, placeholders match`
  : `\n${problems} problem(s) in ${transPath.split('/').pop()}`);
process.exit(problems === 0 ? 0 : 1);
