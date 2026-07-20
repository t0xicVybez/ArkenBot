'use client';

/**
 * Authentication state for the dashboard.
 *
 * No token is stored in the browser — the session lives entirely in an httpOnly
 * cookie the API sets, so there is nothing sensitive to persist here. This store
 * holds only the current user's public profile and a load status; `AuthProvider`
 * hydrates it on mount by calling `/auth/me` (which the cookie authenticates).
 */
import { create } from 'zustand';
import type { PortalUser } from '@arkenbot/shared';

/** `loading` until the first `/auth/me` resolves, then authenticated or not. */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: PortalUser | null;
  status: AuthStatus;
  /** Convenience mirror of `status === 'authenticated'`. */
  isAuthenticated: boolean;
  /** Marks the user as signed in with their profile. */
  setUser: (user: PortalUser) => void;
  /** Marks auth as resolved-but-signed-out. */
  setUnauthenticated: () => void;
  /** Clears local auth state (server-side revocation is a separate API call). */
  logout: () => void;
}

/**
 * Hook and store for reading and mutating authentication state.
 * Can also be called outside React components via `useAuth.getState()`.
 */
export const useAuth = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',
  isAuthenticated: false,
  setUser: (user) => set({ user, status: 'authenticated', isAuthenticated: true }),
  setUnauthenticated: () => set({ user: null, status: 'unauthenticated', isAuthenticated: false }),
  logout: () => set({ user: null, status: 'unauthenticated', isAuthenticated: false }),
}));
