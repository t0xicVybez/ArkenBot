import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Call = { url: string; auth?: string; model: string };

function okResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('../../packages/shared/src/utils/llm.js');
}

describe('chatCompletion fallback', () => {
  let calls: Call[];
  let primaryFails: boolean;

  beforeEach(() => {
    calls = [];
    primaryFails = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string };
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization, model: body.model });
      if (url.includes('127.0.0.1') && primaryFails) throw new TypeError('fetch failed');
      return okResponse('hello');
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it('uses the local model and never calls Groq when the local model works', async () => {
    primaryFails = false;
    const { chatCompletion } = await loadWith({ GROQ_API_KEY: 'gsk_test' });
    expect(await chatCompletion([{ role: 'user', content: 'hi' }])).toBe('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('127.0.0.1');
  });

  it('falls back to Groq when the local model fails, with the Groq model name', async () => {
    const { chatCompletion } = await loadWith({ GROQ_API_KEY: 'gsk_test', GROQ_MODEL: undefined });
    expect(await chatCompletion([{ role: 'user', content: 'hi' }], { model: 'qwen2.5:7b-instruct' })).toBe('hello');
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[1].auth).toBe('Bearer gsk_test');
    expect(calls[1].model).toBe('openai/gpt-oss-20b');
  });

  it('honours GROQ_MODEL for the fallback', async () => {
    const { chatCompletion } = await loadWith({ GROQ_API_KEY: 'gsk_test', GROQ_MODEL: 'some-other-model' });
    await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(calls[1].model).toBe('some-other-model');
  });

  it('rethrows the local failure when no Groq key is configured', async () => {
    const { chatCompletion } = await loadWith({ GROQ_API_KEY: undefined });
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toThrow('fetch failed');
    expect(calls).toHaveLength(1);
  });

  it('does not fall back when the caller aborted the request', async () => {
    const { chatCompletion } = await loadWith({ GROQ_API_KEY: 'gsk_test' });
    const controller = new AbortController();
    controller.abort();
    await expect(chatCompletion([{ role: 'user', content: 'hi' }], { signal: controller.signal })).rejects.toThrow();
    expect(calls.every((c) => c.url.includes('127.0.0.1'))).toBe(true);
  });
});
