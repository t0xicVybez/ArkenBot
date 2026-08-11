/**
 * i18n translation generator.
 *
 * Reads a base-locale JSON catalog and produces one file per supported locale
 * via the LLM, preserving keys, {placeholders}, and Discord markdown. Writes a
 * `_meta.json` alongside recording which locales are AI-generated and unreviewed
 * so native speakers can be pointed at exactly what still needs a human pass.
 *
 * The catalog is flattened to dotted keys and translated in small chunks so each
 * request stays well within the model's output-token budget (a single request
 * for a 600+ key catalog would truncate into invalid JSON). Requests rotate
 * across every configured Groq key (GROQ_API_KEY, GROQ_API_KEY_2, …) round-robin
 * to spread load across each key's independent daily quota.
 *
 * Usage:
 *   tsx -r dotenv/config scripts/i18n-generate.ts <base-en.json> <output-dir> [--only=es-ES,fr] [--force] [--chunk=40]
 *
 * By default it skips locales that already have a file (resume-friendly); pass
 * --force to regenerate everything.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { LOCALES, DEFAULT_LOCALE } from '../packages/shared/src/i18n/locales.js';
import { jsonCompletion } from '../packages/shared/src/utils/llm.js';

const [srcPath, outDir, ...flags] = process.argv.slice(2);
if (!srcPath || !outDir) {
  console.error('usage: tsx scripts/i18n-generate.ts <base-en.json> <output-dir> [--only=a,b] [--force] [--chunk=40]');
  process.exit(1);
}
const force = flags.includes('--force');
const onlyFlag = flags.find((f) => f.startsWith('--only='));
const only = onlyFlag ? onlyFlag.slice('--only='.length).split(',') : null;
const chunkFlag = flags.find((f) => f.startsWith('--chunk='));
const CHUNK_SIZE = chunkFlag ? parseInt(chunkFlag.slice('--chunk='.length)) : 40;

// Collect every configured Groq key for round-robin rotation.
const KEYS = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3]
  .filter((k): k is string => Boolean(k));
if (KEYS.length === 0) {
  console.error('No GROQ_API_KEY configured.');
  process.exit(1);
}
let keyIdx = 0;
const nextKey = (): string => KEYS[keyIdx++ % KEYS.length]!;

type Json = Record<string, unknown>;

/** Flatten nested object → { "a.b.c": "value" } (leaf strings only). */
function flatten(obj: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Json, key, out);
    else out[key] = String(v);
  }
  return out;
}

/** Rebuild nested object from dotted keys. */
function unflatten(flat: Record<string, string>): Json {
  const root: Json = {};
  for (const [dotted, val] of Object.entries(flat)) {
    const parts = dotted.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]!] = (node[parts[i]!] as Json) ?? {};
      node = node[parts[i]!] as Json;
    }
    node[parts[parts.length - 1]!] = val;
  }
  return root;
}

const source = JSON.parse(readFileSync(srcPath, 'utf8')) as Json;
const flatSource = flatten(source);
const allKeys = Object.keys(flatSource);
mkdirSync(outDir, { recursive: true });

const metaPath = join(outDir, '_meta.json');
const meta: Record<string, { aiGenerated: boolean; reviewed: boolean; generatedAt: string }> =
  existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};

// Always (re)write the base locale verbatim.
writeFileSync(join(outDir, `${DEFAULT_LOCALE}.json`), JSON.stringify(source, null, 2) + '\n');

const targets = LOCALES.filter((l) => l.code !== DEFAULT_LOCALE && (!only || only.includes(l.code)));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function translateChunk(loc: { code: string; name: string }, batch: Record<string, string>): Promise<Record<string, string>> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await jsonCompletion<Record<string, string>>(
        [
          {
            role: 'system',
            content:
              `You are a professional localization engine for a Discord bot named "ArkenBot". ` +
              `Translate the JSON UI strings from English into ${loc.name} (${loc.code}). Rules:\n` +
              `- Return ONLY a JSON object with the EXACT same keys as the input (the keys are opaque dotted identifiers — never translate or alter them).\n` +
              `- Translate the string VALUES only.\n` +
              `- Preserve placeholders like {name}, {count}, {channel} EXACTLY — never translate or reorder their contents.\n` +
              `- Preserve Discord markdown (**bold**, \`code\`, emoji) and leading/trailing symbols exactly.\n` +
              `- Do NOT translate the product name "ArkenBot".\n` +
              `- Use natural, native phrasing for ${loc.name}.`,
          },
          { role: 'user', content: JSON.stringify(batch) },
        ],
        { temperature: 0.2, maxTokens: 4000, apiKey: nextKey(), timeoutMs: 60_000 },
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') && attempt < 5) {
        console.log(`    wait ${loc.code} chunk rate-limited — retry in 20s (${attempt}/4)`);
        await sleep(20_000);
      } else if (attempt < 5) {
        console.log(`    warn ${loc.code} chunk error (${msg.slice(0, 80)}) — retry in 5s`);
        await sleep(5_000);
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  for (const loc of targets) {
    const outFile = join(outDir, `${loc.code}.json`);
    if (!force && existsSync(outFile)) {
      console.log(`skip  ${loc.code} (exists — use --force to regenerate)`);
      continue;
    }
    console.log(`gen   ${loc.code} (${loc.name}) — ${allKeys.length} keys in ${Math.ceil(allKeys.length / CHUNK_SIZE)} chunks`);
    const merged: Record<string, string> = {};
    try {
      for (let i = 0; i < allKeys.length; i += CHUNK_SIZE) {
        const slice = allKeys.slice(i, i + CHUNK_SIZE);
        const batch: Record<string, string> = {};
        for (const k of slice) batch[k] = flatSource[k]!;
        const out = await translateChunk(loc, batch);
        // Keep only keys we asked for; fall back to English for any the model dropped.
        for (const k of slice) merged[k] = typeof out[k] === 'string' ? out[k]! : flatSource[k]!;
        await sleep(1500);
      }
    } catch (err) {
      console.error(`FAIL  ${loc.code}: ${(err as Error).message} — skipping (rerun to resume)`);
      continue;
    }
    writeFileSync(outFile, JSON.stringify(unflatten(merged), null, 2) + '\n');
    meta[loc.code] = { aiGenerated: true, reviewed: false, generatedAt: new Date().toISOString() };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`ok    ${loc.code}  (${loc.name})`);
  }

  console.log(`\nDone. ${targets.length} target locale(s) processed. Review status in _meta.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
