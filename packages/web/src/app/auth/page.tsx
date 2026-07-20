'use client';

/**
 * Discord login page. Login is fully server-mediated: the button sends the
 * browser to the API's `/auth/login`, which handles state, PKCE, the Discord
 * round-trip, and the session cookie, then redirects back to the dashboard. No
 * OAuth state or code is ever handled here.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getLoginUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Maps `?error=` codes from a failed callback to a friendly message. */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Something went wrong starting the login. Please try again.',
  invalid_state: 'Your login session expired. Please try again.',
  oauth_failed: 'Discord sign-in failed. Please try again.',
};

function AuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const error = searchParams.get('error');
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Login failed. Please try again.') : null;

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleLogin = () => {
    setLoading(true);
    window.location.href = getLoginUrl('/dashboard');
  };

  return (
    <div className="min-h-screen bg-discord-darkest-bg flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center">
        <div className="w-16 h-16 bg-discord-blurple rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
        <p className="text-gray-400 mb-8">Sign in with your Discord account to manage your servers.</p>

        {errorMessage && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-3 mb-4 text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="btn-primary w-full py-3 text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecting...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Login with Discord
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  // `useSearchParams` (for the ?error= code) requires a Suspense boundary in the
  // App Router.
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}
