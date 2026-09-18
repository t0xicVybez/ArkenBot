'use client';

import { useEffect } from 'react';

/**
 * Opt into the v2 dashboard: clears any legacy-v1 opt-out and sets the v2
 * cookie, then forwards to the dashboard (which will send you through login
 * first if needed — the cookie is already set by then).
 */
export default function EnableV2() {
  useEffect(() => {
    try {
      document.cookie = 'arken_v2=1;path=/;max-age=31536000';
    } catch {
      /* ignore */
    }
    window.location.replace('/dashboard');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Switching to the new dashboard…
    </div>
  );
}
