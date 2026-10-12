/**
 * generic — part of the code-review addon's analyzer/rules layer.
 */
import type { Issue } from '../types.js';

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
