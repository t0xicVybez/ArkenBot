'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';
import { AuthProvider } from '@/components/AuthProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {

            staleTime: 30 * 1000,

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
