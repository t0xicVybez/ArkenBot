/**
 * json — part of the code-review addon's analyzer/rules layer.
 */
import type { Issue } from '../types.js';

export function analyzeJSON(code: string): Issue[] {
  const issues: Issue[] = [];

  try {
    JSON.parse(code);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({ severity: 'error', message: `Invalid JSON: ${msg}` });
  }

  if (/,\s*[}\]]/.test(code)) {
    issues.push({
      severity: 'error',
      message: 'Trailing comma detected — JSON does not allow trailing commas',
    });
  }

  return issues;
}
