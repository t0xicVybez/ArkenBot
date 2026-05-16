'use client';

/**
 * OAuth2 callback handler. Validates the CSRF `state` parameter against the
 * value stored in sessionStorage, then exchanges the code for session tokens.
 *
 * Wrapped in `<Suspense>` because `useSearchParams()` requires it in the
 * Next.js App Router when the component is not a Server Component.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const storedState = sessionStorage.getItem('oauth_state');

    if (!code || !state) {
      setError('Missing OAuth parameters.');
      return;
    }

    // CSRF check: reject the callback if the returned state does not match what was stored.
    if (state !== storedState) {
      setError('Invalid state parameter. Please try logging in again.');
      return;
    }

    sessionStorage.removeItem('oauth_state');

    authApi
      .callback(code, state)
      .then(({ data }) => {
        const { user, accessToken, refreshToken } = data.data!;
        login(user, accessToken, refreshToken);
        router.push('/dashboard');
      })
      .catch(() => {
        setError('Authentication failed. Please try again.');
      });
  }, [searchParams, login, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Login Failed</h1>
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/auth" className="btn-primary">
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <svg className="animate-spin h-10 w-10 text-discord-blurple" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Logging you in...</h1>
        <p className="text-gray-400">Please wait while we complete authentication.</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <svg className="animate-spin h-10 w-10 text-discord-blurple" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Logging you in...</h1>
          <p className="text-gray-400">Please wait while we complete authentication.</p>
        </div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
