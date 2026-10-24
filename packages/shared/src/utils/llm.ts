/**
 * A thin, provider-agnostic language-model client (chat completions) plus `isLLMAvailable`, so AI features can stay dormant and callers can degrade gracefully when no model is configured.
 *
 * Defaults to a locally self-hosted model (Ollama, OpenAI-compatible API,
 * bound to 127.0.0.1 only -- see /etc/systemd/system/ollama.service on the
 * prod box) rather than a paid third-party API. If GROQ_API_KEY is set, a
 * request that fails on the local model is retried once on Groq, so hosts
 * that can't run a local model can still use the AI features.
 */
const LLM_ENDPOINT = process.env.LLM_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

export const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || 'qwen2.5:7b-instruct';

// Optional hosted fallback for self-hosters who can't run a local model.
// Used only when the primary endpoint fails; a caller's own abort never falls back.
const FALLBACK_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const FALLBACK_KEY = process.env.GROQ_API_KEY || undefined;
const FALLBACK_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

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
    super('AI features are unavailable (LLM_DISABLED is set).');
    this.name = 'LLMUnavailableError';
  }
}

export function isLLMAvailable(): boolean {
  return process.env.LLM_DISABLED !== 'true';
}

export async function chatCompletion(messages: LLMMessage[], opts: LLMOptions = {}): Promise<string> {
  if (!isLLMAvailable()) throw new LLMUnavailableError();
  const key = opts.apiKey ?? process.env.LLM_API_KEY;
  try {
    return await send(LLM_ENDPOINT, key, opts.model ?? DEFAULT_LLM_MODEL, messages, opts);
  } catch (err) {
    if (!FALLBACK_KEY || opts.signal?.aborted) throw err;
    // Callers pass the local model's name; that means nothing to the hosted API.
    return send(FALLBACK_ENDPOINT, FALLBACK_KEY, FALLBACK_MODEL, messages, opts);
  }
}

async function send(
  endpoint: string,
  key: string | undefined,
  model: string,
  messages: LLMMessage[],
  opts: LLMOptions,
): Promise<string> {
  const {
    temperature = 0.5,
    maxTokens = 700,
    json = false,
    // Local CPU inference is much slower than a hosted API -- a full
    // triage-shaped call measured ~15-26s warm. 15s (the old Groq-tuned
    // default) would abort a routine, successful call partway through, and
    // a real production call hit 45s too (cold model-reload after an idle
    // gap, stacked with full CPU contention against the live bot -- both
    // addressed separately via OLLAMA_KEEP_ALIVE and a CPUQuota on the
    // ollama.service unit, but keep real safety margin here regardless).
    timeoutMs = 60_000,
    signal,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
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
      // On a json_object mode failure, the error body includes the raw
      // model output it couldn't validate as JSON (`failed_generation`,
      // Groq's name for it -- Ollama's OpenAI-compat layer doesn't
      // currently include this, but keep the generous slice in case a
      // future provider does) -- the single most useful thing for
      // diagnosing *why* (truncation, stray prose, etc).
      throw new Error(`LLM request failed (HTTP ${res.status}): ${detail.slice(0, 1500)}`);
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
