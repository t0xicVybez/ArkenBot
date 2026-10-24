/**
 * A thin, provider-agnostic language-model client (chat completions) plus `isLLMAvailable`, so AI features can stay dormant and callers can degrade gracefully when no model is configured.
 */
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const DEFAULT_LLM_MODEL = 'openai/gpt-oss-20b';

export type LLMRole = 'system' | 'user' | 'assistant';
export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;

  maxTokens?: number;

  json?: boolean;

  timeoutMs?: number;

  signal?: AbortSignal;

  apiKey?: string;
}

export class LLMUnavailableError extends Error {
  constructor() {
    super('AI features are unavailable: GROQ_API_KEY is not configured.');
    this.name = 'LLMUnavailableError';
  }
}

export function isLLMAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function chatCompletion(messages: LLMMessage[], opts: LLMOptions = {}): Promise<string> {
  const key = opts.apiKey ?? process.env.GROQ_API_KEY;
  if (!key) throw new LLMUnavailableError();

  const {
    model = DEFAULT_LLM_MODEL,
    temperature = 0.5,
    maxTokens = 700,
    json = false,
    timeoutMs = 15_000,
    signal,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,

        reasoning_effort: 'low',
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // On a json_object mode failure, Groq's error body includes the raw
      // model output it couldn't validate as JSON (`failed_generation`) --
      // the single most useful thing for diagnosing *why* (truncation,
      // stray prose, etc). The old 200-char slice usually cut this off
      // before it even started. Keep a generous cap, not an unbounded one,
      // since this still ends up in logs.
      throw new Error(`Groq request failed (HTTP ${res.status}): ${detail.slice(0, 1500)}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function jsonCompletion<T>(
  messages: LLMMessage[],
  opts: Omit<LLMOptions, 'json'> = {},
): Promise<T> {
  const raw = await chatCompletion(messages, { ...opts, json: true });
  return JSON.parse(raw || '{}') as T;
}
