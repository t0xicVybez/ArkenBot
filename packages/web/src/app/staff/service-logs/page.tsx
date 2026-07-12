'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useState } from 'react';
import { Terminal, ChevronRight } from 'lucide-react';

type ClassifiedError = { category: string; summary: string; hint?: string; code?: string | number };
type LogEntry = {
  service: 'bot' | 'api' | 'web';
  stream: 'out' | 'err';
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  time: number;
  message: string;
  guildId?: string;
  guildName?: string;
  channelId?: string;
  channelName?: string;
  error?: ClassifiedError;
  errorType?: string;
  stack?: string;
};

const LEVEL_STYLES: Record<string, string> = {
  fatal: 'text-red-300 bg-red-500/15',
  error: 'text-red-400 bg-red-500/10',
  warn: 'text-yellow-400 bg-yellow-500/10',
  info: 'text-sky-400 bg-sky-500/10',
  debug: 'text-gray-400 bg-white/[0.04]',
  trace: 'text-gray-500 bg-white/[0.04]',
};

const SERVICE_STYLES: Record<string, string> = {
  bot: 'text-indigo-300 bg-indigo-500/15',
  api: 'text-emerald-300 bg-emerald-500/15',
  web: 'text-orange-300 bg-orange-500/15',
};

const CATEGORY_LABELS: Record<string, string> = {
  permissions: 'Missing Permission',
  access: 'Missing Access',
  'not-found': 'Not Found',
  'dm-blocked': 'DMs Blocked',
  'rate-limit': 'Rate Limited',
  validation: 'Invalid Request',
  network: 'Network',
  timeout: 'Timeout',
  interaction: 'Interaction',
  unknown: 'Error',
};

export default function ServiceLogsPage() {
  const [service, setService] = useState('all');
  const [level, setLevel] = useState('warn');
  const [stream, setStream] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: ['service-logs', service, level, stream, search],
    queryFn: () =>
      adminApi.getServiceLogs({
        service: service === 'all' ? undefined : service,
        level: level === 'all' ? undefined : level,
        stream: stream === 'all' ? undefined : stream,
        search: search || undefined,
        limit: 300,
      }),
    refetchInterval: 15000,
  });

  const logs = (res?.data?.data?.items ?? []) as LogEntry[];

  return (
    <div className="p-3 sm:p-6">
      <div className="page-head">
        <div className="page-head-icon"><Terminal className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Service Logs</h1>
          <div className="page-head-desc">
            Live output from the bot, API, and web services{isFetching ? ' · refreshing…' : ''}
          </div>
        </div>
      </div>

      <div className="card mb-6 flex flex-col sm:flex-row flex-wrap gap-3">
        <select value={service} onChange={(e) => setService(e.target.value)} className="input sm:w-40">
          <option value="all">All services</option>
          <option value="bot">Bot</option>
          <option value="api">API</option>
          <option value="web">Web</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input sm:w-40">
          <option value="all">All levels</option>
          <option value="info">Info & above</option>
          <option value="warn">Warnings & errors</option>
          <option value="error">Errors only</option>
        </select>
        <select value={stream} onChange={(e) => setStream(e.target.value)} className="input sm:w-40">
          <option value="all">All streams</option>
          <option value="out">stdout</option>
          <option value="err">stderr</option>
        </select>
        <input
          type="text"
          placeholder="Search messages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 min-w-40"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="divide-y divide-[var(--border-subtle)] font-mono text-xs">
          {isLoading ? (
            [...Array(20)].map((_, i) => (
              <div key={i} className="px-4 py-2 animate-pulse"><div className="h-3 bg-gray-700 rounded w-full" /></div>
            ))
          ) : logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 font-sans">No matching log entries</div>
          ) : (
            logs.map((log, i) => {
              const hasDetail = !!(log.error || log.stack);
              const isOpen = expanded === i;
              return (
                <div key={i} className={hasDetail ? 'hover:bg-white/[0.02]' : ''}>
                  <button
                    type="button"
                    onClick={() => hasDetail && setExpanded(isOpen ? null : i)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2.5 ${hasDetail ? 'cursor-pointer' : 'cursor-default'} hover:bg-white/[0.02]`}
                  >
                    <ChevronRight
                      className={`w-3 h-3 mt-1 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''} ${hasDetail ? 'text-gray-500' : 'opacity-0'}`}
                    />
                    <span className="text-gray-600 w-16 flex-shrink-0 tabular-nums">
                      {new Date(log.time).toLocaleTimeString()}
                    </span>
                    <span className={`px-1.5 rounded uppercase text-[10px] font-semibold w-11 text-center flex-shrink-0 ${SERVICE_STYLES[log.service]}`}>
                      {log.service}
                    </span>
                    <span className={`px-1.5 rounded uppercase text-[10px] font-semibold w-12 text-center flex-shrink-0 ${LEVEL_STYLES[log.level]}`}>
                      {log.level}
                    </span>
                    {log.error && (
                      <span className="px-1.5 rounded text-[10px] font-semibold flex-shrink-0 bg-white/[0.06] text-gray-300">
                        {CATEGORY_LABELS[log.error.category] ?? log.error.category}
                      </span>
                    )}
                    <span className={`flex-1 min-w-0 ${isOpen ? '' : 'truncate'} ${log.level === 'error' || log.level === 'fatal' ? 'text-red-300/90' : 'text-gray-300'}`}>
                      {log.error ? log.error.summary : log.message}
                    </span>
                    {(log.guildId || log.channelId) && (
                      <span className="flex-shrink-0 hidden md:flex items-center gap-2 text-[10px] text-gray-500 max-w-[16rem] truncate">
                        {log.guildId && (
                          <span title={`Guild ${log.guildId}`} className="truncate">🏠 {log.guildName ?? `…${log.guildId.slice(-5)}`}</span>
                        )}
                        {log.channelId && (
                          <span title={`Channel ${log.channelId}`} className="truncate">#{log.channelName ?? `…${log.channelId.slice(-5)}`}</span>
                        )}
                      </span>
                    )}
                  </button>

                  {isOpen && hasDetail && (
                    <div className="px-3 pb-3 pl-[4.5rem] space-y-2 text-[11px]">
                      {log.error?.hint && (
                        <p className="text-yellow-300/80"><span className="text-gray-500">Hint:</span> {log.error.hint}</p>
                      )}
                      {(log.guildId || log.channelId) && (
                        <p className="text-gray-500 flex flex-wrap gap-x-4">
                          {log.guildId && (
                            <span>Guild: <span className="text-gray-400">{log.guildName ?? 'Unknown'}</span> <span className="text-gray-600 select-all">({log.guildId})</span></span>
                          )}
                          {log.channelId && (
                            <span>Channel: <span className="text-gray-400">{log.channelName ? `#${log.channelName}` : 'Unknown / deleted'}</span> <span className="text-gray-600 select-all">({log.channelId})</span></span>
                          )}
                        </p>
                      )}
                      {log.message && log.error && log.message !== log.error.summary && (
                        <p className="text-gray-400"><span className="text-gray-600">Message:</span> {log.message}</p>
                      )}
                      {(log.error?.code !== undefined || log.errorType) && (
                        <p className="text-gray-500">
                          {log.errorType && <span>Type: <span className="text-gray-400">{log.errorType}</span>&nbsp;&nbsp;</span>}
                          {log.error?.code !== undefined && <span>Code: <span className="text-gray-400">{String(log.error.code)}</span></span>}
                        </p>
                      )}
                      {log.stack && (
                        <pre className="whitespace-pre-wrap text-gray-500 bg-black/30 rounded p-2 overflow-x-auto max-h-64">
                          {log.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-3">
        Showing up to 300 most-recent entries from the current log tail. Refreshes every 15 seconds.
      </p>
    </div>
  );
}
