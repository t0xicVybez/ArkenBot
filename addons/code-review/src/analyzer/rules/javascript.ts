/**
 * Static analysis rules for JavaScript and TypeScript.
 * Parses with Acorn to catch syntax errors first, then applies per-line lint rules.
 */
import * as acorn from 'acorn';
import type { Issue } from '../types.js';

/**
 * Analyzes JavaScript or TypeScript code for common issues.
 * Returns immediately with a single syntax-error issue when parsing fails —
 * line-level rules are not meaningful on unparseable code.
 *
 * @param code - The source code string.
 * @param lang - `"javascript"` or `"typescript"`. TypeScript-specific checks run only for the latter.
 */
export function analyzeJavaScript(code: string, lang: string): Issue[] {
  const issues: Issue[] = [];

  try {
    acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({ severity: 'error', message: `Syntax error: ${msg}` });
    return issues;
  }

  const lines = code.split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trimmed = line.trimStart();

    // Skip comment lines to avoid false positives on documented examples.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    if (/\bvar\s+/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Use \`const\` or \`let\` instead of \`var\``,
      });
    }

    if (/\beval\s*\(/.test(trimmed)) {
      issues.push({
        severity: 'error',
        message: `Line ${lineNum}: \`eval()\` is a security risk — avoid it`,
      });
    }

    if (/[^=!<>]={2}[^=>]/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Use \`===\` instead of \`==\` for strict equality`,
      });
    }

    if (/[^!]!=[^=]/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Use \`!==\` instead of \`!=\` for strict inequality`,
      });
    }

    if (/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(trimmed)) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Remove debug \`console\` calls before production`,
      });
    }

    if (/\bdebugger\b/.test(trimmed)) {
      issues.push({
        severity: 'warning',
        message: `Line ${lineNum}: Remove \`debugger\` statement`,
      });
    }

    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Unresolved ${trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b/i)?.[0] ?? 'comment'} comment`,
      });
    }

    if (line.length > 120) {
      issues.push({
        severity: 'info',
        message: `Line ${lineNum}: Line length ${line.length} exceeds 120 characters`,
      });
    }
  });

  // TypeScript-specific file-level checks.
  if (lang === 'typescript') {
    if (/:\s*any\b/.test(code)) {
      issues.push({
        severity: 'warning',
        message: `Use of \`any\` type found — prefer specific types for better type safety`,
      });
    }
    if (/@ts-ignore/.test(code)) {
      issues.push({
        severity: 'info',
        message: `Found \`@ts-ignore\` — consider fixing the underlying type issue`,
      });
    }
  }

  return issues;
}
