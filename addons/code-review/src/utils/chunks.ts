/** Utility for sending formatted code as one or more Discord messages. */
import type { ModalSubmitInteraction } from 'discord.js';

/** Maximum safe character count for a single Discord message, leaving a small buffer. */
const MAX_MSG = 1980;

/**
 * Sends formatted code as one or more ephemeral follow-up messages.
 * Splits output at line boundaries to avoid breaking code blocks mid-line.
 * Discord message length is capped at `MAX_MSG` characters (including fences).
 *
 * @param interaction - The modal submit interaction to follow up on.
 * @param lang - The language identifier used in the code fence (e.g. `"typescript"`).
 * @param code - The formatted source code string to send.
 */
export async function sendFormattedCode(
  interaction: ModalSubmitInteraction,
  lang: string,
  code: string,
): Promise<void> {
  const fence = `\`\`\`${lang}\n`;
  const close = '\n```';
  const maxCodeLen = MAX_MSG - fence.length - close.length;

  if (code.length <= maxCodeLen) {
    await interaction.followUp({ content: `${fence}${code}${close}`, ephemeral: true });
    return;
  }

  const lines = code.split('\n');
  let chunk = '';

  for (const line of lines) {
    const candidate = chunk ? `${chunk}\n${line}` : line;

    if (candidate.length > maxCodeLen) {
      if (chunk) {
        await interaction.followUp({ content: `${fence}${chunk}${close}`, ephemeral: true });
      }
      chunk = line;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) {
    await interaction.followUp({ content: `${fence}${chunk}${close}`, ephemeral: true });
  }
}
