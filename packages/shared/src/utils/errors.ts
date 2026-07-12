/**
 * Turns any thrown value into a friendly, categorised description.
 *
 * The bot hits a predictable set of failures — Discord permission and access
 * errors, missing channels/messages, closed DMs, rate limits, and ordinary
 * network timeouts. Raw stack traces bury what actually went wrong; this maps the
 * common cases to a short human summary and, where useful, a hint at the fix. It
 * accepts Error objects, Discord.js `DiscordAPIError`s, the plain `err` objects
 * that Pino serialises into logs, and bare strings.
 */

export type ErrorCategory =
  | 'permissions'
  | 'access'
  | 'not-found'
  | 'dm-blocked'
  | 'rate-limit'
  | 'validation'
  | 'network'
  | 'timeout'
  | 'interaction'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /** One-line, human-readable description of what went wrong. */
  summary: string;
  /** Optional actionable hint (e.g. which permission to grant). */
  hint?: string;
  /** The Discord API error code or Node errno, when one was found. */
  code?: string | number;
}

/** Pulls a numeric/string error code out of the various shapes an error can take. */
function extractCode(err: unknown): string | number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as Record<string, unknown>;
  const raw = e.rawError as { code?: string | number } | undefined;
  return (e.code ?? raw?.code ?? e.errno ?? e.status) as string | number | undefined;
}

/** Pulls a message string out of the various shapes an error can take. */
function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.msg === 'string') return e.msg;
  }
  return String(err);
}

/** Discord API error codes → friendly category, summary, and hint. */
const DISCORD_CODES: Record<number, Omit<ClassifiedError, 'code'>> = {
  10003: { category: 'not-found', summary: 'The channel no longer exists (it was deleted or is inaccessible).', hint: 'Point the feature at an existing channel.' },
  10004: { category: 'not-found', summary: 'The server could not be found — the bot may have been removed.' },
  10008: { category: 'not-found', summary: 'The message no longer exists (it was deleted).' },
  10011: { category: 'not-found', summary: 'The role no longer exists.' },
  10013: { category: 'not-found', summary: 'The user could not be found.' },
  10062: { category: 'interaction', summary: 'The interaction expired before it could be answered (took longer than 3 seconds).', hint: 'Defer the reply for slow operations.' },
  40060: { category: 'interaction', summary: 'The interaction was already answered.' },
  50001: { category: 'access', summary: 'The bot lacks access to that channel or resource.', hint: 'Grant the bot access to the channel (View Channel).' },
  50007: { category: 'dm-blocked', summary: "The user's DMs are closed, so the bot could not message them.", hint: 'This is the user\'s privacy setting — nothing to fix on the server.' },
  50013: { category: 'permissions', summary: 'The bot is missing a permission needed for this action.', hint: 'Give the bot the required permission (e.g. Manage Messages, Send Messages, Embed Links) in that channel or server.' },
  50019: { category: 'permissions', summary: 'The bot cannot move or manage a role higher than its own.', hint: "Move the bot's role above the roles it manages." },
  50025: { category: 'validation', summary: 'The requested change was invalid (invalid OAuth or form data).' },
  50034: { category: 'validation', summary: 'Messages older than 14 days cannot be bulk-deleted.' },
  50035: { category: 'validation', summary: 'Discord rejected the request as malformed (invalid form body).' },
};

/** Node network errnos → friendly category and summary. */
const NETWORK_ERRNOS: Record<string, Omit<ClassifiedError, 'code'>> = {
  ETIMEDOUT: { category: 'timeout', summary: 'The connection timed out — the remote host did not respond.' },
  ESOCKETTIMEDOUT: { category: 'timeout', summary: 'The connection timed out — the remote host did not respond.' },
  ECONNREFUSED: { category: 'network', summary: 'The connection was refused — the port may be closed or the service down.' },
  ECONNRESET: { category: 'network', summary: 'The connection was reset by the remote host.' },
  EHOSTUNREACH: { category: 'network', summary: 'The host was unreachable.' },
  ENOTFOUND: { category: 'network', summary: 'The host could not be resolved (DNS lookup failed).' },
  EAI_AGAIN: { category: 'network', summary: 'A temporary DNS failure occurred — try again shortly.' },
};

/**
 * Classifies any thrown value. Always returns a result — the fallback for an
 * unrecognised error is its own message, trimmed to a single readable line.
 */
export function classifyError(err: unknown): ClassifiedError {
  const code = extractCode(err);
  const message = extractMessage(err);

  // Discord API error codes (numeric).
  if (typeof code === 'number' && DISCORD_CODES[code]) {
    return { ...DISCORD_CODES[code], code };
  }

  // HTTP 429 / rate-limit signalled by status or message.
  if (code === 429 || /rate ?limit/i.test(message)) {
    return { category: 'rate-limit', summary: 'The bot is being rate-limited by Discord — requests are being throttled.', hint: 'This resolves on its own; reduce request frequency if it persists.', code };
  }

  // Node network errnos (string).
  if (typeof code === 'string' && NETWORK_ERRNOS[code]) {
    return { ...NETWORK_ERRNOS[code], code };
  }
  // Some libraries only put the errno in the message.
  for (const errno of Object.keys(NETWORK_ERRNOS)) {
    if (message.includes(errno)) return { ...NETWORK_ERRNOS[errno], code: errno };
  }
  if (/timed? ?out|timeout|aborted/i.test(message)) {
    return { category: 'timeout', summary: 'The operation timed out.', code };
  }

  // Fallback: the message itself, on a single line, capped.
  const summary = message.split('\n')[0].slice(0, 300) || 'An unknown error occurred.';
  return { category: 'unknown', summary, code };
}

/** Short one-liner combining the category and summary, e.g. for a log line. */
export function describeError(err: unknown): string {
  const { category, summary } = classifyError(err);
  return `[${category}] ${summary}`;
}
