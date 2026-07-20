'use client';

/**
 * Account & Security — active session management. Lists every device with a live
 * session (from `GET /auth/sessions`), lets the user revoke individual sessions,
 * and offers a "log out everywhere" action. The session backing the current
 * browser is flagged and cannot be self-revoked from the list (use logout).
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, LogOut, Monitor, ShieldCheck, Trash2 } from 'lucide-react';
import { authApi, type ActiveSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Derives a coarse, human-readable device label from a User-Agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString();
}

export default function AccountPage() {
  const { status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth');
  }, [status, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => authApi.sessions(),
    enabled: status === 'authenticated',
  });

  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      toast.success('Session revoked');
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: () => toast.error('Failed to revoke session'),
  });

  const logoutAll = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => {
      useAuth.getState().logout();
      router.push('/auth');
    },
    onError: () => toast.error('Failed to log out everywhere'),
  });

  if (status !== 'authenticated') return null;

  const sessions: ActiveSession[] = data?.data?.data ?? [];

  return (
    <div className="min-h-screen bg-discord-darkest-bg">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Account &amp; Security</h1>
            <p className="text-gray-400 text-sm">Manage the devices signed in to your account</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <ShieldCheck className="w-5 h-5 text-discord-blurple" /> Active sessions
          </h2>
          <button
            onClick={() => logoutAll.mutate()}
            disabled={logoutAll.isPending}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Log out everywhere
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-discord-blurple" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-gray-400 text-center py-16">No active sessions.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="card flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Monitor className="w-5 h-5 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {deviceLabel(s.userAgent)}
                      {s.current && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple align-middle">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-gray-400 text-sm truncate">
                      {s.ipAddress ?? 'Unknown IP'} · active {formatWhen(s.lastUsedAt)}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending}
                    className="text-gray-400 hover:text-red-400 shrink-0"
                    title="Revoke this session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
