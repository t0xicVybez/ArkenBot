'use client';

/**
 * Hydrates the auth store on mount by calling `/auth/me`. The httpOnly session
 * cookie authenticates that request, so a returning user is recognised without
 * any token being stored in the browser. Renders children immediately — pages
 * gate their own content on `useAuth().status` (loading → authenticated/​not).
 */
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
