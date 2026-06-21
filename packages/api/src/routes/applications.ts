/**
 * REST routes for the Applications addon dashboard.
 * Forms and submissions are stored in the AddonData table (KV per guild).
 * The addon name is 'applications'; keys are 'forms' and 'submissions'.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

// ─── Local types ──────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  placeholder?: string;
}

interface ApplicationForm {
  id: string;
  name: string;
  description: string;
  reviewChannelId: string;
  acceptRoleId?: string;
  enabled: boolean;
  fields: FormField[];
  createdAt: string;
}

interface ApplicationSubmission {
  id: string;
  formId: string;
  userId: string;
  userTag: string;
  answers: Record<string, string>;
  status: 'pending' | 'accepted' | 'denied';
  reviewerId?: string;
  reviewerTag?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── AddonData helpers ────────────────────────────────────────────────────────

const ADDON_NAME = 'applications';
let _addonDbId: string | null = null;

async function getAddonDbId(): Promise<string> {
  if (_addonDbId) return _addonDbId;
  const addon = await prisma.addon.findUnique({ where: { name: ADDON_NAME }, select: { id: true } });
  if (!addon) throw new Error(`Addon '${ADDON_NAME}' is not registered. Start the bot first so it registers the addon.`);
  _addonDbId = addon.id;
  return addon.id;
}

async function readData<T>(guildId: string, key: string): Promise<T | null> {
  const addonId = await getAddonDbId();
  const row = await prisma.addonData.findUnique({
    where: { guildId_addonId_key: { guildId, addonId, key } },
  });
  return row ? (row.value as unknown as T) : null;
}

async function writeData<T>(guildId: string, key: string, value: T): Promise<void> {
  const addonId = await getAddonDbId();
  await prisma.addonData.upsert({
    where: { guildId_addonId_key: { guildId, addonId, key } },
    update: { value: value as object },
    create: { guildId, addonId, key, value: value as object },
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function applicationRoutes(server: FastifyInstance): Promise<void> {

  // ── Forms: list ───────────────────────────────────────────────────────────

  server.get('/guilds/:guildId/applications/forms', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    return reply.send({ success: true, data: forms });
  });

  // ── Forms: create ─────────────────────────────────────────────────────────

  server.post('/guilds/:guildId/applications/forms', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as { name?: string; description?: string; reviewChannelId?: string; acceptRoleId?: string };

    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: 'name is required' });
    if (!body.description?.trim()) return reply.code(400).send({ success: false, error: 'description is required' });
    if (!body.reviewChannelId?.trim()) return reply.code(400).send({ success: false, error: 'reviewChannelId is required' });

    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    if (forms.some((f) => f.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A form with that name already exists' });
    }

    const form: ApplicationForm = {
      id: randomUUID(),
      name: body.name.trim(),
      description: body.description.trim(),
      reviewChannelId: body.reviewChannelId.trim(),
      acceptRoleId: body.acceptRoleId,
      enabled: true,
      fields: [],
      createdAt: new Date().toISOString(),
    };

    forms.push(form);
    await writeData(guildId, 'forms', forms);
    return reply.code(201).send({ success: true, data: form });
  });

  // ── Forms: update ─────────────────────────────────────────────────────────

  server.patch('/guilds/:guildId/applications/forms/:formId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, formId } = request.params as { guildId: string; formId: string };
    const body = request.body as Partial<Pick<ApplicationForm, 'name' | 'description' | 'enabled' | 'acceptRoleId'>>;

    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    const idx = forms.findIndex((f) => f.id === formId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Form not found' });

    if (body.name && forms.some((f) => f.id !== formId && f.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A form with that name already exists' });
    }

    forms[idx] = { ...forms[idx], ...body, id: forms[idx].id, createdAt: forms[idx].createdAt };
    await writeData(guildId, 'forms', forms);
    return reply.send({ success: true, data: forms[idx] });
  });

  // ── Forms: delete ─────────────────────────────────────────────────────────

  server.delete('/guilds/:guildId/applications/forms/:formId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, formId } = request.params as { guildId: string; formId: string };

    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    const filtered = forms.filter((f) => f.id !== formId);
    if (filtered.length === forms.length) return reply.code(404).send({ success: false, error: 'Form not found' });

    await writeData(guildId, 'forms', filtered);
    return reply.send({ success: true });
  });

  // ── Forms: add field ──────────────────────────────────────────────────────

  server.post('/guilds/:guildId/applications/forms/:formId/fields', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, formId } = request.params as { guildId: string; formId: string };
    const body = request.body as { label?: string; style?: 'short' | 'paragraph'; required?: boolean; placeholder?: string };

    if (!body.label?.trim()) return reply.code(400).send({ success: false, error: 'label is required' });

    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    const idx = forms.findIndex((f) => f.id === formId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Form not found' });

    const field: FormField = {
      id: randomUUID(),
      label: body.label.trim(),
      style: body.style ?? 'short',
      required: body.required ?? true,
      placeholder: body.placeholder,
    };

    forms[idx] = { ...forms[idx], fields: [...forms[idx].fields, field] };
    await writeData(guildId, 'forms', forms);
    return reply.code(201).send({ success: true, data: field });
  });

  // ── Forms: remove field ───────────────────────────────────────────────────

  server.delete('/guilds/:guildId/applications/forms/:formId/fields/:fieldId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, formId, fieldId } = request.params as { guildId: string; formId: string; fieldId: string };

    const forms = (await readData<ApplicationForm[]>(guildId, 'forms')) ?? [];
    const idx = forms.findIndex((f) => f.id === formId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Form not found' });

    const origLen = forms[idx].fields.length;
    forms[idx] = { ...forms[idx], fields: forms[idx].fields.filter((f) => f.id !== fieldId) };
    if (forms[idx].fields.length === origLen) return reply.code(404).send({ success: false, error: 'Field not found' });

    await writeData(guildId, 'forms', forms);
    return reply.send({ success: true });
  });

  // ── Submissions: list ─────────────────────────────────────────────────────

  server.get('/guilds/:guildId/applications/submissions', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { formId?: string; status?: string };

    let submissions = (await readData<ApplicationSubmission[]>(guildId, 'submissions')) ?? [];

    if (query.formId) submissions = submissions.filter((s) => s.formId === query.formId);
    if (query.status) submissions = submissions.filter((s) => s.status === query.status);

    submissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return reply.send({ success: true, data: submissions });
  });

  // ── Submissions: review (accept / deny) ───────────────────────────────────

  server.post('/guilds/:guildId/applications/submissions/:submissionId/review', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, submissionId } = request.params as { guildId: string; submissionId: string };
    const body = request.body as { action?: 'accept' | 'deny'; note?: string };

    if (!body.action || !['accept', 'deny'].includes(body.action)) {
      return reply.code(400).send({ success: false, error: "action must be 'accept' or 'deny'" });
    }

    const submissions = (await readData<ApplicationSubmission[]>(guildId, 'submissions')) ?? [];
    const idx = submissions.findIndex((s) => s.id === submissionId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Submission not found' });

    const portalUser = (request as unknown as { user?: { id: string; username: string } }).user;
    const reviewerId = portalUser?.id ?? 'portal';
    const reviewerTag = portalUser?.username ?? 'Dashboard';

    submissions[idx] = {
      ...submissions[idx],
      status: body.action === 'accept' ? 'accepted' : 'denied',
      reviewerId,
      reviewerTag,
      note: body.note,
      updatedAt: new Date().toISOString(),
    };

    await writeData(guildId, 'submissions', submissions);

    // Notify bot to assign roles / send DMs
    pub.publish('applications:review', JSON.stringify({
      guildId,
      submissionId,
      action: body.action,
      note: body.note,
      reviewerId,
      reviewerTag,
    })).catch(() => null);

    return reply.send({ success: true, data: submissions[idx] });
  });
}
