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
      // 2048 was sized for Groq's speed. Measured on the local model under
      // this box's CPU cap: ~5.8 tokens/sec generation -- 2048 tokens would
      // take ~6 minutes, guaranteed to blow the shared 60s default timeout
      // every time (confirmed live: aborted at exactly 60s, fell back to
      // static-analysis-only). Shrunk the budget and gave this call its own
      // longer ceiling instead, since it's a manual, deferred-reply dev
      // command, not a latency-sensitive path.
      { temperature: 0.1, maxTokens: 900, timeoutMs: 180_000 },
    );

    if (!Array.isArray(parsed.issues) || typeof parsed.corrected !== 'string') return null;

    return parsed;
  } catch {
    return null;
  }
}
