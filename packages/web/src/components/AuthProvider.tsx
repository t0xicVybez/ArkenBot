'use client';

import { useEffect } from 'react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.data) useAuth.getState().setUser(data.data);
        else useAuth.getState().setUnauthenticated();
      })
      .catch(() => {
        if (!cancelled) useAuth.getState().setUnauthenticated();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
