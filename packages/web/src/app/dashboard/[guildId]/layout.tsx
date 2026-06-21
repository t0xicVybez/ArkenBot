'use client';

/**
 * Per-guild dashboard layout. Authenticates the session, opens a guild-scoped
 * WebSocket connection, and renders the sidebar alongside the page content.
 */
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { guildsApi } from '@/lib/api';
import { wsClient } from '@/lib/socket';
import { Sidebar } from '@/components/Sidebar';
import { Menu } from 'lucide-react';

export default function GuildLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const guildId = params.guildId as string;
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Zustand's persisted store hydrates asynchronously from localStorage on the client.
  // Render nothing until hydration is complete to avoid a flash of unauthenticated content.
  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!accessToken || !guildId) return;
    wsClient.connect(accessToken, [guildId]);
    return () => wsClient.disconnect();
  }, [accessToken, guildId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) router.push('/auth');
  }, [hydrated, isAuthenticated, router]);

  const { data: guildRes } = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => guildsApi.get(guildId),
    enabled: hydrated && isAuthenticated && !!guildId,
  });

  const guild = guildRes?.data?.data;

  if (!hydrated || !isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-discord-surface">
      <Sidebar
        guildId={guildId}
        guildName={guild?.name}
        guildIcon={guild?.iconUrl}
        installedAddons={guild?.guildAddons?.map((ga: { addon: { name: string } }) => ga.addon.name) ?? []}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-discord-elevated border-[var(--border-subtle)]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <p className="text-[var(--text-primary)] font-semibold text-sm truncate tracking-tight">
            {guild?.name ?? 'Dashboard'}
          </p>
        </div>
        <div className="flex-1">{children}</div>
        <footer className="px-6 py-3 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
          Powered by <span className="text-[var(--text-secondary)] font-medium">Arken Bot</span>
        </footer>
      </main>
    </div>
  );
}
