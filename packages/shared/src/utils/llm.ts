/**
 * Thin client for the Groq chat-completions API (OpenAI-compatible).
 *
 * Centralises the endpoint, default model, timeout, and error handling so every
 * AI feature — the assistant commands, ticket triage, and smart automod — calls
 * the model the same way. Reads `GROQ_API_KEY` from the environment; when it is
 * unset the feature should degrade gracefully rather than error.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Default model — fast, capable, and already used for changelog rewriting. */
export const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile';

export type LLMRole = 'system' | 'user' | 'assistant';
export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  /** Ask the model to return a JSON object (`response_format: json_object`). */
  json?: boolean;
  /** Abort the request after this many milliseconds (default 15000). */
  timeoutMs?: number;
  /** Caller-provided abort signal, combined with the timeout. */
  signal?: AbortSignal;
  /** Explicit API key, overriding `GROQ_API_KEY` (used to rotate across keys). */
  apiKey?: string;
}

/** Raised when no `GROQ_API_KEY` is configured — callers should treat AI as disabled. */
export class LLMUnavailableError extends Error {
  constructor() {
    super('AI features are unavailable: GROQ_API_KEY is not configured.');
    this.name = 'LLMUnavailableError';
  }
}

/** True when the deployment has an API key — check before offering an AI action. */
export function isLLMAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Sends a chat completion and returns the assistant's text.
 * Throws {@link LLMUnavailableError} when no key is set, or a plain Error on a
 * network/HTTP/timeout failure.
 */
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
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Groq request failed (HTTP ${res.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Convenience wrapper for prompts that must return JSON. Enables JSON mode and
 * parses the reply; throws if the model returns malformed JSON.
 */
export async function jsonCompletion<T>(
  messages: LLMMessage[],
  opts: Omit<LLMOptions, 'json'> = {},
): Promise<T> {
  const raw = await chatCompletion(messages, { ...opts, json: true });
  return JSON.parse(raw || '{}') as T;
}
