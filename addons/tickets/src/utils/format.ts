

export function applyCannedVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{(\w+)\}/g, (m, k) => vars[String(k).toLowerCase()] ?? m);
}

export function pickEmoji(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(s)) return s;
  const flag = s.match(/\p{Regional_Indicator}\p{Regional_Indicator}/u);
  if (flag) return flag[0];
  const emoji = s.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u);
  if (emoji) return emoji[0];
  return undefined;
}
