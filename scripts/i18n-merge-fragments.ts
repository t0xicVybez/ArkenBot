/**
 * Deep-merges all `<en-src-dir>/*.json` translation fragments (produced by the
 * extraction agents) into a base `en-US.json` catalog. Existing keys are kept;
 * fragment keys are added, and on a conflict the fragment value wins (the
 * fragments are the fuller extraction). Run once per catalog, then regenerate
 * the other locales with i18n-generate.ts.
 *
 *   tsx scripts/i18n-merge-fragments.ts <base-en.json> <en-src-dir>
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const [basePath, srcDir] = process.argv.slice(2);
if (!basePath || !srcDir) {
  console.error('usage: tsx scripts/i18n-merge-fragments.ts <base-en.json> <en-src-dir>');
  process.exit(1);
}

type Json = Record<string, unknown>;

function deepMerge(target: Json, source: Json): Json {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k] as Json, v as Json);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const base: Json = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {};

let merged = 0;
if (existsSync(srcDir)) {
  for (const file of readdirSync(srcDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const frag = JSON.parse(readFileSync(join(srcDir, file), 'utf8')) as Json;
    deepMerge(base, frag);
    merged++;
    console.log(`merged ${file}`);
  }
}

function countLeaves(o: Json): number {
  let n = 0;
  for (const v of Object.values(o)) n += v && typeof v === 'object' && !Array.isArray(v) ? countLeaves(v as Json) : 1;
  return n;
}

writeFileSync(basePath, JSON.stringify(base, null, 2) + '\n');
console.log(`\nMerged ${merged} fragment(s) into ${basePath}. Total keys: ${countLeaves(base)}.`);
