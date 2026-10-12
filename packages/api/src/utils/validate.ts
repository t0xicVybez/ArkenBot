
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
