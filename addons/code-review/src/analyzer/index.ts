/**
 * Main analysis orchestrator. Tries an AI-powered review first; falls back to
 * language-specific static analysis when the AI is unavailable or fails.
 */
import prettier from 'prettier';
import { analyzeJavaScript } from './rules/javascript.js';
import { analyzePython } from './rules/python.js';
import { analyzeJSON } from './rules/json.js';
import { analyzeGeneric } from './rules/generic.js';
import { reviewWithGroq } from '../ai/groq.js';
import type { AnalysisResult, Issue } from './types.js';

/**
 * Formats `code` with Prettier using the specified parser.
 * Returns the original code unchanged if Prettier cannot parse it,
 * so callers always receive a usable result.
 */
async function tryFormat(code: string, parser: string): Promise<string> {
  try {
    return await prettier.format(code, { parser, printWidth: 100, tabWidth: 2, singleQuote: true });
  } catch {
    return code;
  }
}

/**
 * Analyzes a code snippet and returns issues, a formatted version, and aggregate counts.
 * Prefers AI-powered review when `GROQ_API_KEY` is set; otherwise uses static rules.
 *
 * @param code - The raw source code string.
 * @param lang - The language identifier (e.g. `"typescript"`, `"python"`).
 */
export async function analyze(code: string, lang: string): Promise<AnalysisResult> {
  const aiReview = await reviewWithGroq(code, lang);
  if (aiReview) {
    const issues = aiReview.issues;
    return {
      language: lang,
      issues,
      formatted: aiReview.corrected || code,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      infoCount: issues.filter((i) => i.severity === 'info').length,
      aiPowered: true,
      summary: aiReview.summary,
    };
  }

  let issues: Issue[] = [];
  let formatted = code;

  switch (lang) {
    case 'javascript':
      issues = analyzeJavaScript(code, 'javascript');
      formatted = await tryFormat(code, 'babel');
      break;

    case 'typescript':
      issues = analyzeJavaScript(code, 'typescript');
      formatted = await tryFormat(code, 'typescript');
      break;

    case 'python':
      issues = analyzePython(code);
      // Normalize tabs to 4 spaces and strip trailing whitespace per PEP 8.
      formatted = code
        .split('\n')
        .map((l) => l.replace(/\t/g, '    ').trimEnd())
        .join('\n')
        .trimEnd();
      break;

    case 'json':
      issues = analyzeJSON(code);
      try {
        formatted = JSON.stringify(JSON.parse(code), null, 2);
      } catch {
        // Keep the original if JSON.parse fails (the issue is already reported).
      }
      break;

    case 'css':
      formatted = await tryFormat(code, 'css');
      break;

    case 'html':
      formatted = await tryFormat(code, 'html');
      break;

    default:
      // No language-specific rules available; generic checks still run below.
      break;
  }

  // Generic checks apply to all languages regardless of which branch ran above.
  issues.push(...analyzeGeneric(code));

  return {
    language: lang,
    issues,
    formatted,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    infoCount: issues.filter((i) => i.severity === 'info').length,
  };
}
