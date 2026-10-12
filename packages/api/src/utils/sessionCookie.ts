/**
 * Sets and clears the session auth cookie with the correct security flags (HttpOnly, SameSite, Secure).
 */
import type { FastifyReply } from 'fastify';
import { config } from '../config.js';

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

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
  });
}
