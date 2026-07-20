'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';
import { AuthProvider } from '@/components/AuthProvider';

/**
 * Root client-side providers: React Query with a 30 s stale time and single
 * retry, plus a themed toast notifier.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30 s window before data is considered stale and refetched in the background.
            staleTime: 30 * 1000,
            // One automatic retry reduces noise from transient network errors.
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#2F3136',
            color: '#DCDDDE',
            border: '1px solid #4f545c',
          },
          success: {
            iconTheme: { primary: '#57F287', secondary: '#2F3136' },
          },
          error: {
            iconTheme: { primary: '#ED4245', secondary: '#2F3136' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
