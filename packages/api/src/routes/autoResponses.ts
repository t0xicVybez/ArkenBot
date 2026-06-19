/**
 * Routes for managing guild-specific regex auto-responses.
 */
import vm from 'node:vm';
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

const MAX_PATTERN_LENGTH = 500;

// Runs the regex against a worst-case string inside a vm sandbox with a 100 ms
// timeout. Returns true when the pattern causes catastrophic backtracking.
// The pattern is passed as a context variable — never embedded in the script
// source — so there is no code-injection path.
const REDOS_PROBE_SCRIPT = new vm.Script('new RegExp(pattern, flags).test(probe)');
function causesReDoS(pattern: string, flags: string): boolean {
  const ctx = vm.createContext({
    pattern,
    flags: flags.replace(/[^gimsuy]/g, ''),
    probe: 'a'.repeat(50) + '!',
  });
  try {
    REDOS_PROBE_SCRIPT.runInContext(ctx, { timeout: 100 });
    return false;
  } catch (e: any) {
    return e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
  }
}

function validatePattern(pattern: unknown, flags: unknown): string | null {
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH)
    return `Pattern must be a string under ${MAX_PATTERN_LENGTH} characters`;
  const f = typeof flags === 'string' ? flags : 'i';
  try {
    new RegExp(pattern, f);
  } catch {
    return 'Invalid regex pattern or flags';
  }
  if (causesReDoS(pattern, f))
    return 'Pattern causes excessive backtracking (ReDoS risk)';
  return null;
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
