import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load root .env for monorepo support (Next.js only reads its own package dir by default)
try {
  const envFile = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // .env not found, fall back to environment variables already set
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'discordapp.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
  },
  // Security response headers for every route. The CSP allows Next's inline
  // bootstrap (unsafe-inline) but scopes network access to the actual API/WS
  // origins (derived from env, so it stays correct for self-hosters). img-src
  // stays broad because the embed builder and rank-card backgrounds render
  // arbitrary user-supplied image URLs. Can be tightened with nonces later.
  async headers() {
    const originOf = (url, fallback) => { try { return new URL(url || fallback).origin; } catch { return fallback; } };
    const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4000');
    const wsOrigin = originOf(process.env.NEXT_PUBLIC_WS_URL, 'ws://localhost:4000');
    const connect = ["'self'", apiOrigin, wsOrigin].filter((v, i, a) => v && a.indexOf(v) === i).join(' ');
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connect}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

import createNextIntlPlugin from 'next-intl/plugin';

// Points at the request config; the active locale is read from the arken_locale cookie.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
