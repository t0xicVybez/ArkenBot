/**
 * Static analysis rules for Python code.
 * Uses the Lezer Python parser for syntax error detection and adds
 * PEP 8 style checks via per-line pattern matching.
 */
import { parser as pythonParser } from '@lezer/python';
import type { Issue } from '../types.js';

/** Keywords that require a trailing colon to open a block. */
const COLON_KEYWORDS = [
  'def ', 'class ', 'if ', 'elif ', 'else', 'else:', 'for ', 'while ',
  'try', 'try:', 'except', 'except:', 'finally', 'finally:', 'with ', 'async def ', 'async for ',
];

/**
 * Analyzes Python code for syntax errors and common style violations.
 * Syntax errors are detected using the Lezer parser tree; style issues use
 * pattern matching aligned with PEP 8.
 *
 * @param code - The Python source code string.
 * @returns An array of issues found.
 */
export function analyzePython(code: string): Issue[] {
  const issues: Issue[] = [];
  const lines = code.split('\n');

  // Use the Lezer parse tree to find syntax error nodes.
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

    // Skip blank lines and comments.
    if (!trimmed || trimmed.startsWith('#')) return;

    // Check for keywords that must end with a colon to open a block.
    for (const kw of COLON_KEYWORDS) {
      if (trimmed.startsWith(kw) && !trimmed.endsWith(':') && !trimmed.includes('#')) {
        // Ignore line continuations and open parentheses; they span multiple lines.
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

    // PEP 8 requires indentation in multiples of 4 spaces.
    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (indent > 0 && indent % 4 !== 0) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Indentation of ${indent} spaces — use multiples of 4 (PEP 8)`,
      });
    }

    // PEP 8 recommends a maximum line length of 79 characters.
    if (line.length > 79) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Line length ${line.length} — PEP 8 recommends ≤79 characters`,
      });
    }

    // Python 2 print statement without parentheses.
    if (/^print\s+[^(=]/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Python 2 \`print\` statement — use \`print()\``,
      });
    }

    // Bare `except:` silently swallows all exceptions including KeyboardInterrupt.
    if (trimmed === 'except:') {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Bare \`except:\` catches all exceptions — specify the exception type`,
      });
    }

    // Mutable default arguments are evaluated once at definition time, not per-call.
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

    // `== True` / `== False` should use identity comparison or direct boolean evaluation.
    if (/==\s*(True|False)\b/.test(trimmed) || /(True|False)\s*==/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Use \`is True\` / \`is False\` or just the boolean directly, not \`== True\``,
      });
    }
  });

  // Mixed tabs and spaces cause IndentationError at runtime in Python 3.
  if (hasTabs && hasSpaces) {
    issues.push({
      severity: 'error',
      message: 'Mixed tabs and spaces detected — use 4 spaces consistently (PEP 8)',
    });
  }

  return issues;
}
