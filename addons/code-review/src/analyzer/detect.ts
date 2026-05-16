/** Language detection via weighted pattern matching against known language signatures. */

interface LangPattern {
  lang: string;
  patterns: RegExp[];
}

const LANG_PATTERNS: LangPattern[] = [
  {
    lang: 'json',
    patterns: [/^\s*[\[{]/, /"\w+":\s*(\[|{|"|true|false|\d)/],
  },
  {
    lang: 'html',
    patterns: [/<(!DOCTYPE|html|head|body|div|span|p|a\s|ul|li|h[1-6]|script|style)/i, /<!--/, /<\/\w+>/],
  },
  {
    lang: 'css',
    patterns: [/[.#][\w-]+\s*\{/, /:\s*[\w-]+;/, /@(media|keyframes|import)\s/, /display\s*:\s*(flex|grid|block|inline)/],
  },
  {
    lang: 'sql',
    patterns: [/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i],
  },
  {
    lang: 'rust',
    patterns: [/\bfn\s+\w+\s*\(/, /\blet\s+mut\s+/, /\buse\s+\w+::/, /\bimpl\s+\w+/, /\bpub\s+(fn|struct|enum)\b/],
  },
  {
    lang: 'go',
    patterns: [/\bfunc\s+\w+\s*\(/, /\bpackage\s+\w+/, /\bfmt\.(Print|Println|Sprintf)/, /\b\w+\s*:=\s*/],
  },
  {
    lang: 'python',
    patterns: [/\bdef\s+\w+\s*\(/, /\bclass\s+\w+/, /\bfrom\s+\w+\s+import\b/, /\bimport\s+\w+/, /:\s*$|:\s*#/m, /\bprint\s*\(/],
  },
  {
    lang: 'typescript',
    patterns: [/:\s*(string|number|boolean|void|any|unknown|never)\b/, /\binterface\s+\w+/, /\btype\s+\w+\s*=/, /\bas\s+(string|number|any|unknown)\b/, /<[A-Z]\w*>/, /\benum\s+\w+/],
  },
  {
    lang: 'javascript',
    patterns: [/\b(const|let|var)\s+\w+\s*=/, /\bfunction\s*\w*\s*\(/, /=>\s*[{(]/, /\b(import|export)\s/, /\brequire\s*\(/, /\.(map|filter|reduce|forEach)\s*\(/],
  },
];

/**
 * Detects the most likely programming language for a code snippet by counting
 * pattern matches for each known language.
 *
 * When two languages score equally, the one listed earlier in `LANG_PATTERNS`
 * (more specific) is preferred. Returns `"text"` when no patterns match.
 *
 * @param code - The raw source code string to classify.
 * @returns A language identifier string (e.g. `"typescript"`, `"python"`).
 */
export function detectLanguage(code: string): string {
  const scores: Record<string, number> = {};

  for (const { lang, patterns } of LANG_PATTERNS) {
    scores[lang] = patterns.filter((re) => re.test(code)).length;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, runner] = sorted;

  if (!best || best[1] === 0) return 'text';

  // When two languages are tied, prefer the one that appears first in
  // LANG_PATTERNS because more specific languages are listed earlier.
  if (runner && runner[1] === best[1]) {
    const bestIdx = LANG_PATTERNS.findIndex((p) => p.lang === best[0]);
    const runnerIdx = LANG_PATTERNS.findIndex((p) => p.lang === runner[0]);
    return bestIdx < runnerIdx ? best[0] : runner[0];
  }

  return best[0];
}
