/**
 * groq — part of the code-review addon's ai layer.
 *
 * Despite the filename (kept to avoid churn elsewhere), this now goes
 * through the shared LLM client (packages/shared/src/utils/llm.ts), which
 * defaults to a locally self-hosted model rather than Groq's API.
 */
import { jsonCompletion, isLLMAvailable } from '@arkenbot/shared';

export interface GroqReview {
  issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string }>;
  corrected: string;
  summary: string;
}

const SYSTEM_PROMPT =
  'You are an expert code reviewer. ' +
  'Always respond with a single valid JSON object and nothing else — no markdown fences, no explanation outside the JSON.';

function buildUserPrompt(code: string, lang: string): string {
  return (
    `Review the following ${lang} code and return a JSON object with this exact shape:\n` +
    `{\n` +
    `  "issues": [ { "severity": "error"|"warning"|"info", "message": "..." } ],\n` +
    `  "corrected": "<the corrected/improved code as a string>",\n` +
    `  "summary": "<one-sentence overall assessment>"\n` +
    `}\n\n` +
    `Severity guide:\n` +
    `  error   = bugs, syntax errors, security vulnerabilities\n` +
    `  warning = bad practices, potential runtime bugs, deprecated APIs\n` +
    `  info    = style suggestions, minor improvements\n\n` +
    `Code to review:\n\`\`\`${lang}\n${code}\n\`\`\``
  );
}

export async function reviewWithGroq(code: string, lang: string): Promise<GroqReview | null> {
  if (!isLLMAvailable()) return null;

  try {
    const parsed = await jsonCompletion<GroqReview>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(code, lang) },
      ],
      { temperature: 0.1, maxTokens: 2048 },
    );

    if (!Array.isArray(parsed.issues) || typeof parsed.corrected !== 'string') return null;

    return parsed;
  } catch {
    return null;
  }
}
