'use client';

import { create } from 'zustand';
import type { PortalUser } from '@arkenbot/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: PortalUser | null;
  status: AuthStatus;

  isAuthenticated: boolean;

  setUser: (user: PortalUser) => void;

  setUnauthenticated: () => void;

  logout: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',
  isAuthenticated: false,
  setUser: (user) => set({ user, status: 'authenticated', isAuthenticated: true }),
  setUnauthenticated: () => set({ user: null, status: 'unauthenticated', isAuthenticated: false }),
  logout: () => set({ user: null, status: 'unauthenticated', isAuthenticated: false }),
}));
