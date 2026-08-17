/**
 * AI Assistant addon.
 * Registers `/ask` (general assistant) and `/summarize` (catch up on a channel),
 * both powered by the shared Groq LLM client. Degrades gracefully when no
 * `GROQ_API_KEY` is configured.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { isLLMAvailable } from '@arkenbot/shared';

import askCommand from './commands/ask.js';
import summarizeCommand from './commands/summarize.js';
import { locales } from './locales.js';

export default defineAddon({
  locales,
  manifest: {
    name: 'ai',
    displayName: 'AI Assistant',
    version: '1.0.0',
    description:
      'AI-powered assistant: /ask answers questions and /summarize catches you up on a channel. Requires a Groq API key.',
    author: 't0xicVybez',
    commands: ['ask', 'summarize'],
    settings: [],
  },

  commands: [askCommand, summarizeCommand],

  hooks: {
    onLoad(ctx: AddonContext): void {
      ctx.logger.info(
        isLLMAvailable()
          ? 'AI Assistant addon loaded — /ask and /summarize ready.'
          : 'AI Assistant addon loaded, but GROQ_API_KEY is not set — commands will report AI as unavailable.',
      );
    },
  },
});
