import { NextRequest, NextResponse } from 'next/server';

/**
 * Nonce-based Content-Security-Policy (Next 16 proxy).
 *
 * A fresh nonce is minted per request and handed to Next (via the request-side
 * `Content-Security-Policy` header, which Next reads to stamp `nonce=` onto its
 * own inline bootstrap + chunk-loader scripts). This lets us drop `unsafe-inline`
 * and `unsafe-eval` from `script-src` — the main XSS gap the old static, blanket
 * CSP left open — while `strict-dynamic` lets those trusted scripts pull the rest.
 *
 * Trade-off: emitting a per-request nonce opts pages into dynamic rendering, so
 * the marketing pages lose static prerendering. Acceptable for a dashboard-centric
 * app; the pages are tiny and sit behind nginx.
 *
 * `style-src` keeps `unsafe-inline`: Next injects inline styles without a nonce
 * and style-injection is far lower risk than script execution. `img-src` stays
 * broad (`https:`) because the embed builder and rank-card backgrounds render
 * arbitrary user-supplied image URLs.
 */
function originOf(url: string | undefined, fallback: string): string {
  try {
    return new URL(url || fallback).origin;
  } catch {
    return fallback;
  }
}

const API_ORIGIN = originOf(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4000');
const WS_ORIGIN = originOf(process.env.NEXT_PUBLIC_WS_URL, 'ws://localhost:4000');
const CONNECT = ["'self'", API_ORIGIN, WS_ORIGIN].filter((v, i, a) => v && a.indexOf(v) === i).join(' ');

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' makes browsers trust scripts the nonced bootstrap loads and
    // ignore host allowlists; keep 'self' as a fallback for CSP2-only browsers.
    // 'unsafe-eval' only in dev (React refresh / Next dev overlay need it).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${CONNECT}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce from this request-side CSP header and applies it to its scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Run on every page route; skip Next's static assets, the image optimizer,
  // favicon, and prefetch requests (which don't execute scripts).
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
