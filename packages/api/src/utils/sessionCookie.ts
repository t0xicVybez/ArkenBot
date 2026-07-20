/**
 * Helpers for setting and clearing the opaque session cookie. Centralised so the
 * callback route (initial issue), the auth middleware (transparent rotation), and
 * logout all use identical, correctly-scoped cookie attributes.
 */
import type { FastifyReply } from 'fastify';
import { config } from '../config.js';

/** Writes the session id as an httpOnly cookie scoped to the whole site. */
export function setSessionCookie(reply: FastifyReply, sid: string): void {
  reply.setCookie(config.cookie.name, sid, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
    maxAge: Math.floor(config.session.absoluteExpiryMs / 1000),
    signed: false,
  });
}

/** Clears the session cookie (logout). Attributes must match those used to set it. */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
  });
}
