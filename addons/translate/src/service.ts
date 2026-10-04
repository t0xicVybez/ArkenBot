/** LibreTranslate client for the translate addon. Self-hosted on localhost:5000. */

const LT_URL = (process.env.LIBRETRANSLATE_URL || 'http://localhost:5000').replace(/\/$/, '');
const LT_KEY = process.env.LIBRETRANSLATE_API_KEY || '';
const TIMEOUT_MS = parseInt(process.env.LIBRETRANSLATE_TIMEOUT_MS || '20000', 10);
const CACHE_MAX = parseInt(process.env.TRANSLATION_CACHE_SIZE || '5000', 10);

export function isTranslateAvailable(): boolean {
  return Boolean(LT_URL);
}

const cache = new Map<string, { text: string; detected: string }>();
function remember(key: string, val: { text: string; detected: string }) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, val);
}

export class TranslateError extends Error {}

/** Translate `q` into `target`; `source='auto'` lets LT detect it. */
export async function translate(q: string, target: string, source = 'auto'): Promise<{ text: string; detected: string }> {
  const key = `${source}\u0000${target}\u0000${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${LT_URL}/translate`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, source, target, format: 'text', ...(LT_KEY ? { api_key: LT_KEY } : {}) }),
    });
    if (!res.ok) throw new TranslateError(`LibreTranslate responded ${res.status}`);
    const data = (await res.json()) as { translatedText?: string; detectedLanguage?: { language?: string } };
    const out = { text: data.translatedText ?? '', detected: data.detectedLanguage?.language ?? (source === 'auto' ? 'auto' : source) };
    remember(key, out);
    return out;
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(err instanceof Error ? err.message : 'translation failed');
  } finally {
    clearTimeout(to);
  }
}

/** Human-readable name for an LT language code. */
const NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', 'pt-BR': 'Portuguese', pt: 'Portuguese',
  nl: 'Dutch', ru: 'Russian', pl: 'Polish', tr: 'Turkish', id: 'Indonesian', ja: 'Japanese', ko: 'Korean',
  'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)', ar: 'Arabic', hi: 'Hindi', uk: 'Ukrainian',
  vi: 'Vietnamese', th: 'Thai', sv: 'Swedish', cs: 'Czech', el: 'Greek', he: 'Hebrew', auto: 'Auto-detected',
};
export function langName(code: string): string {
  return NAMES[code] ?? code;
}

/** Target-language choices for the /translate command (Discord caps at 25). */
export const LANG_CHOICES: { name: string; value: string }[] = [
  ['English', 'en'], ['Spanish', 'es'], ['French', 'fr'], ['German', 'de'], ['Italian', 'it'],
  ['Portuguese', 'pt-BR'], ['Dutch', 'nl'], ['Russian', 'ru'], ['Polish', 'pl'], ['Turkish', 'tr'],
  ['Indonesian', 'id'], ['Japanese', 'ja'], ['Korean', 'ko'], ['Chinese (Simplified)', 'zh-Hans'],
  ['Chinese (Traditional)', 'zh-Hant'], ['Arabic', 'ar'], ['Hindi', 'hi'], ['Ukrainian', 'uk'],
  ['Vietnamese', 'vi'], ['Thai', 'th'], ['Swedish', 'sv'], ['Czech', 'cs'], ['Greek', 'el'], ['Hebrew', 'he'],
].map(([name, value]) => ({ name, value }));

/** Country-flag emoji → LT language code, for flag-reaction translation. */
export const FLAG_TO_LANG: Record<string, string> = {
  '🇺🇸': 'en', '🇬🇧': 'en', '🇦🇺': 'en', '🇨🇦': 'en',
  '🇪🇸': 'es', '🇲🇽': 'es', '🇦🇷': 'es',
  '🇫🇷': 'fr', '🇩🇪': 'de', '🇮🇹': 'it',
  '🇧🇷': 'pt-BR', '🇵🇹': 'pt-BR',
  '🇳🇱': 'nl', '🇷🇺': 'ru', '🇵🇱': 'pl', '🇹🇷': 'tr', '🇮🇩': 'id',
  '🇯🇵': 'ja', '🇰🇷': 'ko', '🇨🇳': 'zh-Hans', '🇹🇼': 'zh-Hant', '🇭🇰': 'zh-Hant',
  '🇸🇦': 'ar', '🇮🇳': 'hi', '🇺🇦': 'uk', '🇻🇳': 'vi', '🇹🇭': 'th',
  '🇸🇪': 'sv', '🇨🇿': 'cs', '🇬🇷': 'el', '🇮🇱': 'he',
};

/** Map a user's Discord locale to the closest LT code (for right-click default target). */
export function localeToLt(locale: string): string {
  const l = (locale || 'en').toLowerCase();
  const m: Record<string, string> = {
    'en-us': 'en', 'en-gb': 'en', 'es-es': 'es', 'es-419': 'es', fr: 'fr', de: 'de', it: 'it',
    'pt-br': 'pt-BR', nl: 'nl', ru: 'ru', pl: 'pl', tr: 'tr', id: 'id', ja: 'ja', ko: 'ko',
    'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hant',
  };
  return m[l] ?? l.split('-')[0];
}
