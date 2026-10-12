
import prettier from 'prettier';
import { analyzeJavaScript } from './rules/javascript.js';
import { analyzePython } from './rules/python.js';
import { analyzeJSON } from './rules/json.js';
import { analyzeGeneric } from './rules/generic.js';
import { reviewWithGroq } from '../ai/groq.js';
import type { AnalysisResult, Issue } from './types.js';

async function tryFormat(code: string, parser: string): Promise<string> {
  try {
    return await prettier.format(code, { parser, printWidth: 100, tabWidth: 2, singleQuote: true });
  } catch {
    return code;
  }
}

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

      }
      break;

    case 'css':
      formatted = await tryFormat(code, 'css');
      break;

    case 'html':
      formatted = await tryFormat(code, 'html');
      break;

    default:

      break;
  }

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
