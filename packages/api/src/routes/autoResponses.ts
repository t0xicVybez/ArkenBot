/**
 * Routes for managing guild-specific regex auto-responses.
 */
import vm from 'node:vm';
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

const MAX_PATTERN_LENGTH = 500;

// Validates the pattern inside a vm sandbox so user data never flows into
// new RegExp() directly in this module. The sandbox catches both SyntaxErrors
// (invalid pattern/flags) and ERR_SCRIPT_EXECUTION_TIMEOUT (ReDoS).
// Pattern and flags are passed as context variables, not embedded in source.
const VALIDATE_SCRIPT = new vm.Script('new RegExp(pattern, flags).test(probe)');

function validatePattern(pattern: unknown, flags: unknown): string | null {
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH)
    return `Pattern must be a string under ${MAX_PATTERN_LENGTH} characters`;
  const f = (typeof flags === 'string' ? flags : 'i').replace(/[^gimsuy]/g, '');
  const ctx = vm.createContext({ pattern, flags: f, probe: 'a'.repeat(50) + '!' });
  try {
    VALIDATE_SCRIPT.runInContext(ctx, { timeout: 100 });
    return null;
  } catch (e: any) {
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT')
      return 'Pattern causes excessive backtracking (ReDoS risk)';
    return 'Invalid regex pattern or flags';
  }
}

/**
 * GET    /guilds/:guildId/auto-responses      — list all auto-responses
 * POST   /guilds/:guildId/auto-responses      — create a new auto-response
 * PATCH  /guilds/:guildId/auto-responses/:id  — update (enable/disable/edit)
 * DELETE /guilds/:guildId/auto-responses/:id  — delete an auto-response
 */
export async function autoResponseRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/auto-responses', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.autoResponse.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/auto-responses', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { pattern, flags, response, embed, embedColor, deleteMessage, requiredRoles, ignoredRoles } = request.body as any;

    if (!pattern || !response) {
      return reply.code(400).send({ success: false, error: 'pattern and response are required' });
    }

    const patternError = validatePattern(pattern, flags);
    if (patternError) return reply.code(400).send({ success: false, error: patternError });

    const row = await prisma.autoResponse.create({
      data: {
        guildId,
        pattern,
        flags:         flags ?? 'i',
        response,
        embed:         embed ?? false,
        embedColor:    embedColor ?? null,
        deleteMessage: deleteMessage ?? false,
        requiredRoles: requiredRoles ?? [],
        ignoredRoles:  ignoredRoles ?? [],
        createdById:   (request as any).user?.id ?? 'dashboard',
      },
    });

    return reply.code(201).send({ success: true, data: row });
  });

  server.patch('/guilds/:guildId/auto-responses/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as any;

    if (body.pattern !== undefined || body.flags !== undefined) {
      const patternError = validatePattern(body.pattern ?? '', body.flags);
      if (patternError) return reply.code(400).send({ success: false, error: patternError });
    }

    const result = await prisma.autoResponse.updateMany({
      where: { id, guildId },
      data: {
        ...(body.pattern       !== undefined && { pattern:       body.pattern }),
        ...(body.flags         !== undefined && { flags:         body.flags }),
        ...(body.response      !== undefined && { response:      body.response }),
        ...(body.embed         !== undefined && { embed:         body.embed }),
        ...(body.embedColor    !== undefined && { embedColor:    body.embedColor }),
        ...(body.deleteMessage !== undefined && { deleteMessage: body.deleteMessage }),
        ...(body.enabled       !== undefined && { enabled:       body.enabled }),
        ...(body.requiredRoles !== undefined && { requiredRoles: body.requiredRoles }),
        ...(body.ignoredRoles  !== undefined && { ignoredRoles:  body.ignoredRoles }),
      },
    });

    if (result.count === 0) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true });
  });

  server.delete('/guilds/:guildId/auto-responses/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.autoResponse.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });
}
