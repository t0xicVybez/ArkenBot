import { NextRequest, NextResponse } from 'next/server';

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

  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {

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
