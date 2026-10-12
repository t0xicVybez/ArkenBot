/**
 * `cn` helper — conditionally join and de-duplicate Tailwind class names.
 */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
