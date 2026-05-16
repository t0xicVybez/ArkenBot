/** Static analysis rules for JSON files. */
import type { Issue } from '../types.js';

/**
 * Analyzes a JSON string for validity and common mistakes.
 * Reports a parse error when the JSON is malformed and warns about trailing
 * commas, which are a frequent source of JSON parse failures.
 *
 * @param code - The raw JSON string.
 * @returns An array of issues found.
 */
export function analyzeJSON(code: string): Issue[] {
  const issues: Issue[] = [];

  try {
    JSON.parse(code);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({ severity: 'error', message: `Invalid JSON: ${msg}` });
  }

  // JSON.parse rejects trailing commas, but the error message is sometimes
  // cryptic, so we surface a clearer explanation when the pattern is detected.
  if (/,\s*[}\]]/.test(code)) {
    issues.push({
      severity: 'error',
      message: 'Trailing comma detected — JSON does not allow trailing commas',
    });
  }

  return issues;
}
