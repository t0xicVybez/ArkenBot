/**
 * Request validation helper. Standardises zod validation across routes so each
 * handler is one line and every 400 response uses the same envelope.
 *
 *   import { z } from 'zod';
 *   import { parse } from '../utils/validate.js';
 *
 *   const body = parse(z.object({ name: z.string().min(1) }), request.body, reply);
 *   if (!body) return;            // 400 already sent
 *   // ...use body.name (typed)
 *
 * Returns the parsed, typed value on success. On failure it sends a 400 with the
 * standard `{ success: false, error, details }` shape and returns null — callers
 * must `return` immediately when the result is null.
 */
import type { FastifyReply } from 'fastify';
import type { ZodSchema } from 'zod';

export function parse<T>(schema: ZodSchema<T>, data: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({
      success: false,
      error: 'Invalid request',
      details: result.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}
