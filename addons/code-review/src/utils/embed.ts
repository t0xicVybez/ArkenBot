/** Builds the Discord embed summarising a code review result. */
import { EmbedBuilder } from 'discord.js';
import type { AnalysisResult } from '../analyzer/types.js';

const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  sql: 'SQL',
  rust: 'Rust',
  go: 'Go',
  text: 'Plain Text',
};

const SEVERITY_ICONS = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
} as const;

/**
 * Constructs a Discord embed summarising the issues found in an analysis result.
 * The embed color reflects the worst severity (red → yellow → green).
 * A maximum of 20 issues are shown inline; overflow is noted as a count.
 *
 * @param result - The analysis result returned by `analyze()`.
 * @returns A configured `EmbedBuilder` ready to be sent.
 */
export function buildResultEmbed(result: AnalysisResult): EmbedBuilder {
  const isClean = result.errorCount === 0 && result.warningCount === 0 && result.infoCount === 0;
  const color =
    result.errorCount > 0
      ? 0xed4245
      : result.warningCount > 0
        ? 0xfee75c
        : 0x57f287;

  const langLabel = LANG_LABELS[result.language] ?? result.language;
  const modeTag = result.aiPowered ? '✨ AI-Powered' : '⚙️ Static Analysis';
  const titleSuffix = result.aiPowered ? ' ✨' : '';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🔍 Code Review — ${langLabel}${titleSuffix}`)
    .setTimestamp();

  if (result.summary) {
    embed.setDescription(`*${result.summary}*`);
  }

  if (isClean) {
    const clean = '✅ **No issues found.** Your code looks clean!';
    embed.setDescription(result.summary ? `*${result.summary}*\n\n${clean}` : clean);
  } else {
    const MAX_SHOWN = 20;
    const shown = result.issues.slice(0, MAX_SHOWN);
    const overflow = result.issues.length - MAX_SHOWN;

    const lines = shown.map((i) => `${SEVERITY_ICONS[i.severity]} ${i.message}`);
    if (overflow > 0) lines.push(`*…and ${overflow} more issue${overflow > 1 ? 's' : ''}*`);

    const issueBlock = lines.join('\n');
    embed.setDescription(
      result.summary ? `*${result.summary}*\n\n${issueBlock}` : issueBlock,
    );
  }

  embed.addFields(
    { name: '🔴 Errors', value: String(result.errorCount), inline: true },
    { name: '🟡 Warnings', value: String(result.warningCount), inline: true },
    { name: '🔵 Info', value: String(result.infoCount), inline: true },
  );

  const footerParts: string[] = [modeTag];
  if (!isClean) footerParts.push('Corrected code attached below');
  embed.setFooter({ text: footerParts.join(' · ') });

  return embed;
}
