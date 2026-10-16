/**
 * Reads and parses the PM2 log files behind the staff dashboard's service-log view, classifying lines by level and category. LOG_SERVICES lists which processes it reads.
 */
import { open, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { classifyError, type ClassifiedError } from '@arkenbot/shared';

export const LOG_SERVICES = ['bot', 'api', 'web'] as const;
export type LogService = (typeof LOG_SERVICES)[number];

const STREAM_SUFFIX: Record<'out' | 'err', string> = { out: 'out', err: 'error' };

const PINO_LEVELS: Record<number, LogLevel> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
const LEVEL_RANK: Record<LogLevel, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

const MAX_TAIL_BYTES = 512 * 1024;

export interface ServiceLogEntry {
  service: LogService;
  stream: 'out' | 'err';
  level: LogLevel;

  time: number;
  message: string;

  guildId?: string;

  guildName?: string;

  channelId?: string;

  channelName?: string;

  error?: ClassifiedError;

  errorType?: string;
  stack?: string;
}

const SNOWFLAKE = '(\\d{17,20})';

// Known-benign web noise we never surface in the dashboard. These are Next.js
// server-action requests that can't be honoured but are harmless: a scanner (or
// a client on an old build) sends a bogus/stale `Next-Action` header, Next
// rejects it and moves on. Nothing is broken, so filter them out of the view.
// (The raw lines still exist in the PM2 log file if deep debugging is needed.)
const IGNORED_LINE_PATTERNS: RegExp[] = [
  /Server Reference ID did not match the expected format/i,
  /Failed to find Server Action/i,
  /failed-to-find-server-action/i,
];

function firstMatch(text: string | undefined, re: RegExp): string | undefined {
  if (!text) return undefined;
  return text.match(re)?.[1];
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function extractContext(
  obj: Record<string, unknown>,
  rawErr: { url?: string } | undefined,
): { guildId?: string; channelId?: string } {
  const reqUrl = asString((obj.req as { url?: string } | undefined)?.url) ?? asString(obj.url);
  const errUrl = asString(rawErr?.url);
  const msg = asString(obj.msg);

  const guildId =
    asString(obj.guildId) ??
    asString(obj.guild) ??
    firstMatch(errUrl, new RegExp(`/guilds/${SNOWFLAKE}`)) ??
    firstMatch(reqUrl, new RegExp(`/guilds/${SNOWFLAKE}`)) ??
    firstMatch(msg, new RegExp(`guild ${SNOWFLAKE}`, 'i'));

  const channelId =
    asString(obj.channelId) ??
    asString(obj.channel) ??
    firstMatch(errUrl, new RegExp(`/channels/${SNOWFLAKE}`)) ??
    firstMatch(msg, new RegExp(`channel ${SNOWFLAKE}`, 'i'));

  return { guildId, channelId };
}

export interface ServiceLogQuery {
  service?: LogService | 'all';
  stream?: 'out' | 'err' | 'all';

  minLevel?: LogLevel;

  search?: string;
  limit?: number;
}

const logDir = process.env.PM2_LOG_DIR || join(homedir(), '.pm2', 'logs');

async function tail(path: string, maxBytes: number): Promise<{ text: string; mtimeMs: number; truncated: boolean }> {
  try {
    const st = await stat(path);
    const start = Math.max(0, st.size - maxBytes);
    const length = st.size - start;
    if (length === 0) return { text: '', mtimeMs: st.mtimeMs, truncated: false };
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      return { text: buf.toString('utf8'), mtimeMs: st.mtimeMs, truncated: start > 0 };
    } finally {
      await fh.close();
    }
  } catch {
    return { text: '', mtimeMs: 0, truncated: false };
  }
}

function parseLine(line: string, service: LogService, stream: 'out' | 'err', mtimeMs: number): ServiceLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (IGNORED_LINE_PATTERNS.some((re) => re.test(trimmed))) return null;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof obj.level === 'number' && (obj.msg !== undefined || obj.err !== undefined)) {
        const level = PINO_LEVELS[obj.level as number] ?? 'info';
        const rawErr = obj.err as { type?: string; message?: string; stack?: string; code?: unknown; url?: string } | undefined;
        const entry: ServiceLogEntry = {
          service,
          stream,
          level,
          time: typeof obj.time === 'number' ? obj.time : mtimeMs,
          message: String(obj.msg ?? rawErr?.message ?? ''),
        };
        if (rawErr || level === 'error' || level === 'fatal') {
          entry.error = classifyError(rawErr ?? obj.msg);
          entry.errorType = rawErr?.type;
          entry.stack = rawErr?.stack;
        }
        const ctx = extractContext(obj, rawErr);
        if (ctx.guildId) entry.guildId = ctx.guildId;
        if (ctx.channelId) entry.channelId = ctx.channelId;
        return entry;
      }
    } catch {

    }
  }

  const level: LogLevel = /(^|\s)(error|✖|⨯|uncaught|unhandled)/i.test(trimmed)
    ? 'error'
    : /(^|\s)(warn|deprecat)/i.test(trimmed)
      ? 'warn'
      : 'info';
  const entry: ServiceLogEntry = { service, stream, level, time: mtimeMs, message: trimmed.slice(0, 2000) };
  if (level === 'error') entry.error = classifyError(trimmed);
  return entry;
}

export async function readServiceLogs(query: ServiceLogQuery = {}): Promise<ServiceLogEntry[]> {

  const requested = query.service && query.service !== 'all' ? [query.service] : [...LOG_SERVICES];
  const services = requested
    .map((name) => LOG_SERVICES.find((allowed) => allowed === name))
    .filter((name): name is LogService => name !== undefined);
  const streams: Array<'out' | 'err'> =
    query.stream && query.stream !== 'all' ? [query.stream] : ['out', 'err'];
  const minRank = query.minLevel ? LEVEL_RANK[query.minLevel] : 0;
  const search = query.search?.toLowerCase();
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);

  const all: ServiceLogEntry[] = [];
  for (const service of services) {
    for (const stream of streams) {
      const { text, mtimeMs, truncated } = await tail(join(logDir, `${service}-${STREAM_SUFFIX[stream]}.log`), MAX_TAIL_BYTES);
      if (!text) continue;
      const lines = text.split('\n');
      if (truncated) lines.shift();
      for (const line of lines) {
        const entry = parseLine(line, service, stream, mtimeMs);
        if (!entry) continue;
        if (LEVEL_RANK[entry.level] < minRank) continue;
        if (search && !entry.message.toLowerCase().includes(search)) continue;
        all.push(entry);
      }
    }
  }

  all.sort((a, b) => b.time - a.time);
  return all.slice(0, limit);
}
