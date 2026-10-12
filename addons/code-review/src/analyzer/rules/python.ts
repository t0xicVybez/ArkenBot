/**
 * python — part of the code-review addon's analyzer/rules layer.
 */
import { parser as pythonParser } from '@lezer/python';
import type { Issue } from '../types.js';

const COLON_KEYWORDS = [
  'def ', 'class ', 'if ', 'elif ', 'else', 'else:', 'for ', 'while ',
  'try', 'try:', 'except', 'except:', 'finally', 'finally:', 'with ', 'async def ', 'async for ',
];

export function analyzePython(code: string): Issue[] {
  const issues: Issue[] = [];
  const lines = code.split('\n');

  const tree = pythonParser.parse(code);
  const cursor = tree.cursor();
  const seenLines = new Set<number>();

  do {
    if (cursor.type.isError) {
      const lineNum = code.slice(0, cursor.from).split('\n').length;
      if (!seenLines.has(lineNum)) {
        seenLines.add(lineNum);
        const snippet = code.slice(cursor.from, Math.min(cursor.to, cursor.from + 30)).trim();
        issues.push({
          severity: 'error',
          message: `Line ${lineNum}: Syntax error${snippet ? ` near \`${snippet}\`` : ''}`,
        });
      }
    }
  } while (cursor.next());

  let hasTabs = false;
  let hasSpaces = false;

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) return;

    for (const kw of COLON_KEYWORDS) {
      if (trimmed.startsWith(kw) && !trimmed.endsWith(':') && !trimmed.includes('#')) {

        if (!trimmed.endsWith('\\') && !trimmed.endsWith('(')) {
          issues.push({
            severity: 'error',
            message: `Line ${lineNum}: Missing \`:\` at end of \`${kw.trim()}\` block`,
          });
        }
        break;
      }
    }

    if (line.startsWith('\t')) hasTabs = true;
    if (line.startsWith('  ')) hasSpaces = true;

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent > 0 && indent % 4 !== 0) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Indentation of ${indent} spaces — use multiples of 4 (PEP 8)`,
      });
    }

    if (line.length > 79) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Line length ${line.length} — PEP 8 recommends ≤79 characters`,
      });
    }

    if (/^print\s+[^(=]/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Python 2 \`print\` statement — use \`print()\``,
      });
    }

    if (trimmed === 'except:') {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Bare \`except:\` catches all exceptions — specify the exception type`,
      });
    }

    if (/def\s+\w+\([^)]*=\s*[\[{]/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Mutable default argument detected — use \`None\` as default and assign inside the function`,
      });
    }

    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Unresolved ${trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b/i)?.[0] ?? 'comment'} comment`,
      });
    }

    if (/==\s*(True|False)\b/.test(trimmed) || /(True|False)\s*==/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Use \`is True\` / \`is False\` or just the boolean directly, not \`== True\``,
      });
    }
  });

  if (hasTabs && hasSpaces) {
    issues.push({
      severity: 'error',
      message: 'Mixed tabs and spaces detected — use 4 spaces consistently (PEP 8)',
    });
  }

  return issues;
}
