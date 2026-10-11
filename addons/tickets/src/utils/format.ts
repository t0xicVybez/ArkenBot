/**
 * Pure formatting helpers for the Tickets addon — no Discord/DB dependencies,
 * so they're cheap to unit-test.
 */

/**
 * Substitute canned-response placeholders. Known keys are replaced; anything
 * else (including unknown `{tokens}`) is left exactly as written. Keys are
 * matched case-insensitively.
 */
export function applyCannedVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{(\w+)\}/g, (m, k) => vars[String(k).toLowerCase()] ?? m);
}

/**
 * Extract a single valid Discord emoji from a raw field value, or undefined.
 * Accepts a custom-emoji token (`<:name:id>` / `<a:name:id>`), a country flag
 * (two regional-indicator chars), or the first leading unicode emoji sequence;
 * trailing text is dropped. Returns undefined when nothing valid is present —
 * preventing COMPONENT_INVALID_EMOJI from text typed into an emoji field.
 */
export function pickEmoji(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(s)) return s; // custom emoji token
  const flag = s.match(/\p{Regional_Indicator}\p{Regional_Indicator}/u);
  if (flag) return flag[0]; // country flag (pair of regional indicators)
  const emoji = s.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u);
  if (emoji) return emoji[0]; // first unicode emoji sequence, trailing text dropped
  return undefined;
}
