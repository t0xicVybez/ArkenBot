/**
 * i18n translation generator.
 *
 * Reads a base-locale JSON catalog and produces one file per supported locale
 * via the LLM, preserving keys, {placeholders}, and Discord markdown. Writes a
 * `_meta.json` alongside recording which locales are AI-generated and unreviewed
 * so native speakers can be pointed at exactly what still needs a human pass.
 *
 * Usage:
 *   tsx -r dotenv/config scripts/i18n-generate.ts <base-en.json> <output-dir> [--only=es-ES,fr] [--force]
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
  console.error('usage: tsx scripts/i18n-generate.ts <base-en.json> <output-dir> [--only=a,b] [--force]');
  process.exit(1);
}
const force = flags.includes('--force');
const onlyFlag = flags.find((f) => f.startsWith('--only='));
const only = onlyFlag ? onlyFlag.slice('--only='.length).split(',') : null;

const source = JSON.parse(readFileSync(srcPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

const metaPath = join(outDir, '_meta.json');
const meta: Record<string, { aiGenerated: boolean; reviewed: boolean; generatedAt: string }> =
  existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};

// Always (re)write the base locale verbatim.
const baseFile = join(outDir, `${DEFAULT_LOCALE}.json`);
writeFileSync(baseFile, JSON.stringify(source, null, 2) + '\n');

const targets = LOCALES.filter((l) => l.code !== DEFAULT_LOCALE && (!only || only.includes(l.code)));

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  let first = true;
  for (const loc of targets) {
    const outFile = join(outDir, `${loc.code}.json`);
    if (!force && existsSync(outFile)) {
      console.log(`skip  ${loc.code} (exists — use --force to regenerate)`);
      continue;
    }
    // Stay under Groq's tokens-per-minute limit: pace requests and retry on 429.
    if (!first) await sleep(8000);
    first = false;
    let translated: Record<string, unknown> | null = null;
    for (let attempt = 1; attempt <= 4 && !translated; attempt++) {
      try {
        translated = await jsonCompletion<Record<string, unknown>>(
          [
            {
              role: 'system',
              content:
                `You are a professional localization engine for a Discord bot named "ArkenBot". ` +
                `Translate the JSON UI strings from English into ${loc.name} (${loc.code}). Rules:\n` +
                `- Return ONLY a JSON object with the EXACT same keys and nesting as the input.\n` +
                `- Translate the string VALUES only, never the keys.\n` +
                `- Preserve placeholders like {name}, {language}, {input} EXACTLY — never translate or reorder their contents.\n` +
                `- Preserve Discord markdown (**bold**, \`code\`, emoji) exactly.\n` +
                `- Do NOT translate the product name "ArkenBot".\n` +
                `- Use natural, native phrasing for ${loc.name}.`,
            },
            { role: 'user', content: JSON.stringify(source) },
          ],
          { temperature: 0.2, maxTokens: 4000 },
        );
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('429') && attempt < 4) {
          console.log(`wait  ${loc.code} rate-limited — retrying in 25s (attempt ${attempt}/3)`);
          await sleep(25000);
        } else {
          console.error(`FAIL  ${loc.code}: ${msg}`);
          break;
        }
      }
    }
    if (translated) {
      writeFileSync(outFile, JSON.stringify(translated, null, 2) + '\n');
      meta[loc.code] = { aiGenerated: true, reviewed: false, generatedAt: new Date().toISOString() };
      console.log(`ok    ${loc.code}  (${loc.name})`);
    }
  }

  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`\nDone. Base=${basename(baseFile)}, ${targets.length} target locale(s) processed. Review status in _meta.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
