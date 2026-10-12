

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';

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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(code, lang) },
        ],
        max_tokens: 2048,
        temperature: 0.1,
        reasoning_effort: 'low',
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const raw = data.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned) as GroqReview;

    if (!Array.isArray(parsed.issues) || typeof parsed.corrected !== 'string') return null;

    return parsed;
  } catch {
    return null;
  }
}
