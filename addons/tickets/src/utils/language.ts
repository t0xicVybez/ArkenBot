/**
 * Language detection for AI triage, via the same self-hosted LibreTranslate
 * instance the translate addon and the i18n pipeline already depend on.
 * Returns an ISO 639-1 code (e.g. 'es', 'ja') — good enough for an LLM
 * prompt, no human-readable name mapping needed. Falls back to 'en' on
 * any failure (unreachable, empty text, low confidence) rather than
 * blocking triage on a non-essential enhancement.
 */
const LT_URL = (process.env.LIBRETRANSLATE_URL || 'http://localhost:5000').replace(/\/$/, '');

export async function detectLanguage(text: string): Promise<string> {
  const sample = text.trim().slice(0, 500);
  if (!sample) return 'en';

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${LT_URL}/detect`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: sample }),
      });
      if (!res.ok) return 'en';
      const results = (await res.json()) as Array<{ language?: string; confidence?: number }>;
      const best = results?.[0];
      if (!best?.language || (best.confidence ?? 0) < 40) return 'en';
      return best.language;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return 'en';
  }
}
