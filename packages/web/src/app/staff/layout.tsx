'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { wsClient } from '@/lib/socket';
import {
  LayoutDashboard,
  Server,
  Users,
  Puzzle,
  FileText,
  BarChart3,
  LogOut,
  Shield,
  Settings,
  Menu,
  X,
  LayoutGrid,
  Megaphone,
  Terminal,
} from 'lucide-react';
import { Topbar } from '@/components/Topbar';

const staffNav = [
  { href: '/staff', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/staff/guilds', label: 'Guilds', icon: Server },
  { href: '/staff/users', label: 'Users', icon: Users },
  { href: '/staff/addons', label: 'Addons', icon: Puzzle },
  { href: '/staff/logs', label: 'Audit Logs', icon: FileText },
  { href: '/staff/service-logs', label: 'Service Logs', icon: Terminal },
  { href: '/staff/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/staff/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/staff/settings', label: 'Settings', icon: Settings },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { status, isAuthenticated, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // The session cookie authenticates the WebSocket upgrade — no token needed.
  useEffect(() => {
    if (!isAuthenticated) return;
    wsClient.connect();
    return () => wsClient.disconnect();
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { router.push('/auth'); return; }
    if (!user?.isStaff && !user?.isBotOwner) router.push('/dashboard');
  }, [status, user, router]);

  if (status !== 'authenticated' || (!user?.isStaff && !user?.isBotOwner)) return null;

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch { /* ignore */ }
    logout();
    router.push('/');
  };

  return (
    <div className="staff-theme flex min-h-screen bg-[var(--bg-base)]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-56 bg-[var(--bg-card)] flex flex-col border-r border-white/[0.06] transition-transform duration-200',
        'md:relative md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Header */}
        <div className="px-2.5 pt-3 pb-2">
          <div className="flex items-center gap-2.5 p-2.5 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[13px] leading-tight">ArkenBot HQ</p>
              <p className="text-[var(--text-muted)] text-[11px] truncate">staff portal · {user?.username}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-500 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {staffNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-purple-500/15 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]',
                )}
              >
                <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-purple-400' : '')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 py-2 border-t border-white/[0.06] space-y-0.5">
          <Link
            href="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors w-full"
          >
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
            Server Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[var(--bg-card)]">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white transition-colors" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <p className="text-white font-semibold text-sm">Staff Portal</p>
          </div>
        </div>
        <Topbar variant="staff" />
        <div className="flex-1">
          <div className="max-w-[1120px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
