#!/usr/bin/env node
/**
 * i18n-translate — fill locale files from en-US using the self-hosted
 * LibreTranslate (http://localhost:5000). Replaces hand-translation.
 *
 *   node scripts/i18n-translate.mjs                 # fill MISSING keys, bot + web
 *   node scripts/i18n-translate.mjs --all           # retranslate EVERY key (overwrites)
 *   node scripts/i18n-translate.mjs --web           # web messages only
 *   node scripts/i18n-translate.mjs --bot           # bot locales only
 *   node scripts/i18n-translate.mjs --locale=fr,de  # only these targets
 *   node scripts/i18n-translate.mjs --dry           # translate + report, don't write
 *
 * Correctness gates (never bypassed):
 *   • ICU {placeholders} are tokenised so LT can't translate their contents.
 *   • Rich-text <tags> pass through LT's HTML mode.
 *   • Strings containing ICU plural/select are SKIPPED (copied from en-US) —
 *     MT would destroy the ICU structure. Reported at the end.
 *   • A brand glossary (ArkenBot, VALORANT, Riot, Discord, …) is never translated.
 *   • After translating, every {placeholder} and <tag> from the source MUST be
 *     present in the output, else we fall back to the en-US value for that key.
 *   • Web strings get curly apostrophes (next-intl ICU safety).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LT_URL = (process.env.LIBRETRANSLATE_URL || 'http://localhost:5000').replace(/\/$/, '');
const LT_KEY = process.env.LIBRETRANSLATE_API_KEY || '';
const CONCURRENCY = parseInt(process.env.LIBRETRANSLATE_CONCURRENCY || '4', 10);
const TIMEOUT_MS = parseInt(process.env.LIBRETRANSLATE_TIMEOUT_MS || '20000', 10);

// our locale → LibreTranslate code (this instance has pt-BR + zh-Hans natively)
const LOCALE_TO_LT = {
  'es-ES': 'es', fr: 'fr', de: 'de', it: 'it', nl: 'nl', 'pt-BR': 'pt-BR',
  ru: 'ru', pl: 'pl', tr: 'tr', id: 'id', ja: 'ja', ko: 'ko', 'zh-CN': 'zh-Hans',
};
const BOT_DIR = path.join(ROOT, 'packages/bot/src/i18n/locales');
const WEB_DIR = path.join(ROOT, 'packages/web/messages');

// Never translate these (whole-word, case-sensitive).
const GLOSSARY = [
  'ArkenBot', 'Arken Bot', 'LibreTranslate', 'Discord', 'VALORANT', 'Valorant',
  'Riot Sign-On', 'Riot ID', 'Riot', 'RSO', 'PUUID', 'Trello', 'Monday.com',
  'YouTube', 'Twitch', 'Kick', 'Reddit', 'RSS', 'Groq', 'WebSub', 'Lavalink',
  'Top.gg', 'FiveM', 'Minecraft', 'Palworld',
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const ALL = flag('all');
const DRY = flag('dry');
const ONLY_WEB = flag('web');
const ONLY_BOT = flag('bot');
const ONLY_LOCALES = opt('locale')?.split(',').map((s) => s.trim());

const ICU_COMPLEX = /\{\s*[\w.]+\s*,\s*(plural|select|selectordinal)\s*,/;
const warnings = [];
const cache = new Map();

/** Mask ICU {placeholders}, glossary terms, `code`, and URLs as <x id="N"/> tokens. */
function protect(str) {
  const tokens = [];
  const stash = (m) => { tokens.push(m); return `<x id="${tokens.length - 1}"/>`; };
  let s = str;
  s = s.replace(/https?:\/\/\S+/g, stash);         // URLs
  s = s.replace(/`[^`]*`/g, stash);                 // inline code
  s = s.replace(/\{[^{}]+\}/g, stash);              // simple ICU placeholders
  for (const term of GLOSSARY) {
    s = s.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), stash);
  }
  return { masked: s, tokens };
}
function restore(translated, tokens) {
  return translated.replace(/<x\s+id="(\d+)"\s*(?:\/>|>\s*<\/x>)/g, (_, i) => tokens[Number(i)] ?? '');
}
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&#160;': ' ' };
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp|#160);/g, (m) => ENTITIES[m] ?? m);
}
/** Every {placeholder} and <tag> in src must survive in out. */
function structureOk(src, out) {
  const ph = (x) => (x.match(/\{[^{}]+\}/g) || []).sort();
  const tg = (x) => (x.match(/<\/?[a-zA-Z][^>]*>/g) || []).map((t) => t.replace(/\s+/g, '').toLowerCase()).sort();
  const a = ph(src), b = ph(out);
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) return false;
  const ta = tg(src), tb = tg(out);
  return ta.length === tb.length && ta.every((v, i) => v === tb[i]);
}

async function ltTranslate(text, target) {
  const key = `${target}\u0000${text}`;
  if (cache.has(key)) return cache.get(key);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${LT_URL}/translate`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target, format: 'html', ...(LT_KEY ? { api_key: LT_KEY } : {}) }),
    });
    if (!res.ok) throw new Error(`LT ${res.status}`);
    const out = (await res.json()).translatedText ?? '';
    cache.set(key, out);
    return out;
  } finally { clearTimeout(to); }
}

/** Translate one source string → target locale, with all gates. Returns {value, status}. */
async function translateString(src, locale) {
  if (typeof src !== 'string' || !src.trim()) return { value: src, status: 'copy' };
  if (ICU_COMPLEX.test(src)) { warnings.push(`[skip-ICU] ${locale}: ${src.slice(0, 60)}`); return { value: src, status: 'skip-icu' }; }
  const ltCode = LOCALE_TO_LT[locale];
  const { masked, tokens } = protect(src);
  let out;
  try { out = await ltTranslate(masked, ltCode); }
  catch (e) { warnings.push(`[lt-error] ${locale}: ${e.message} :: ${src.slice(0, 50)}`); return { value: src, status: 'error' }; }
  out = restore(decodeEntities(out), tokens);
  if (!structureOk(src, out)) { warnings.push(`[bad-structure→fallback] ${locale}: ${src.slice(0, 60)}`); return { value: src, status: 'fallback' }; }
  return { value: out, status: 'ok' };
}

/** Walk the en-US tree; fill target leaves. Mutates `target`. Collects jobs for concurrency. */
function collectJobs(srcNode, tgtNode, locale, pathArr, jobs) {
  for (const [k, v] of Object.entries(srcNode)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!tgtNode[k] || typeof tgtNode[k] !== 'object') tgtNode[k] = {};
      collectJobs(v, tgtNode[k], locale, [...pathArr, k], jobs);
    } else if (typeof v === 'string') {
      const missing = !(k in tgtNode);
      if (ALL || missing) jobs.push({ src: v, locale, set: (val) => { tgtNode[k] = val; } });
    }
  }
}

async function runPool(jobs) {
  let i = 0, done = 0;
  const stats = { ok: 0, 'skip-icu': 0, fallback: 0, error: 0, copy: 0 };
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      const isWeb = job.web;
      const r = await translateString(job.src, job.locale);
      let val = r.value;
      if (isWeb && typeof val === 'string') val = val.replace(/'/g, '’'); // next-intl ICU apostrophe
      job.set(val);
      stats[r.status] = (stats[r.status] || 0) + 1;
      if (++done % 50 === 0) process.stdout.write(`\r  translated ${done}/${jobs.length}…`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  process.stdout.write(`\r  translated ${done}/${jobs.length}   \n`);
  return stats;
}

async function processDir(dir, label, isWeb) {
  const enPath = path.join(dir, 'en-US.json');
  if (!fs.existsSync(enPath)) { console.log(`(${label}: no en-US.json, skipping)`); return; }
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const locales = Object.keys(LOCALE_TO_LT).filter((l) => !ONLY_LOCALES || ONLY_LOCALES.includes(l));
  console.log(`\n── ${label} (${locales.length} locales) ──`);
  const jobs = [];
  const targets = {};
  for (const loc of locales) {
    const p = path.join(dir, `${loc}.json`);
    const tgt = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    targets[loc] = tgt;
    const locJobs = [];
    collectJobs(en, tgt, loc, [], locJobs);
    for (const j of locJobs) { j.web = isWeb; jobs.push(j); }
  }
  console.log(`  ${jobs.length} strings to translate (${ALL ? 'all' : 'missing only'})`);
  const stats = await runPool(jobs);
  console.log('  stats:', JSON.stringify(stats));
  if (!DRY) {
    for (const loc of locales) {
      fs.writeFileSync(path.join(dir, `${loc}.json`), JSON.stringify(targets[loc], null, 2) + '\n');
    }
    console.log('  written ✓');
  } else console.log('  (dry run — nothing written)');
}

(async () => {
  console.log(`LibreTranslate: ${LT_URL} · concurrency ${CONCURRENCY} · timeout ${TIMEOUT_MS}ms`);
  // connectivity preflight
  try { const r = await fetch(`${LT_URL}/languages`, { signal: AbortSignal.timeout(5000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); }
  catch (e) { console.error(`✗ LibreTranslate unreachable at ${LT_URL}: ${e.message}`); process.exit(1); }

  if (!ONLY_WEB) await processDir(BOT_DIR, 'bot', false);
  if (!ONLY_BOT) await processDir(WEB_DIR, 'web', true);

  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warnings (ICU skips / fallbacks / errors):`);
    for (const w of warnings.slice(0, 40)) console.log('  ' + w);
    if (warnings.length > 40) console.log(`  …and ${warnings.length - 40} more`);
  }
  console.log('\nDone. Run the parity check next:  pnpm test  (i18n parity)');
})();
