/** Generic linting rules applied to all languages regardless of type. */
import type { Issue } from '../types.js';

/**
 * Checks for common formatting issues that apply to any text file.
 * Currently detects trailing whitespace on each line and a missing trailing newline.
 *
 * @param code - The full source code string.
 * @returns An array of issues found.
 */
export function analyzeGeneric(code: string): Issue[] {
  const issues: Issue[] = [];
  const lines = code.split('\n');

  lines.forEach((line, i) => {
    if (/\s+$/.test(line)) {
      issues.push({
        severity: 'info',
        message: `Line ${i + 1}: Trailing whitespace`,
      });
    }
  });

  if (code.length > 0 && !code.endsWith('\n')) {
    issues.push({
      severity: 'info',
      message: 'File does not end with a newline',
    });
  }

  return issues;
}
