/**
 * chunks helpers for the code-review addon.
 */
import type { ModalSubmitInteraction } from 'discord.js';

const MAX_MSG = 1980;

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
