'use client';

/**
 * Authentication store backed by Zustand with localStorage persistence.
 * Holds the current user, access token, and refresh token. The `partialize`
 * option ensures only serialisable auth fields are written to localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortalUser } from '@arkenbot/shared';

interface AuthState {
  user: PortalUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: PortalUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (user: PortalUser) => void;
}

/**
 * Hook and store for reading and mutating authentication state.
 * Can also be called outside React components via `useAuth.getState()`.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      login: (user, accessToken, refreshToken) => {
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
