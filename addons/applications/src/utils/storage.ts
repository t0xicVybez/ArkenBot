import type { AddonStorage } from '@arkenbot/addon-sdk';
import type { ApplicationForm, ApplicationSubmission } from '../types.js';

const KEY_FORMS = 'forms';
const KEY_SUBMISSIONS = 'submissions';

export async function getForms(storage: AddonStorage, guildId: string): Promise<ApplicationForm[]> {
  return (await storage.get<ApplicationForm[]>(KEY_FORMS, guildId)) ?? [];
}

export async function getForm(storage: AddonStorage, guildId: string, formId: string): Promise<ApplicationForm | null> {
  const forms = await getForms(storage, guildId);
  return forms.find((f) => f.id === formId) ?? null;
}

export async function saveForm(storage: AddonStorage, guildId: string, form: ApplicationForm): Promise<void> {
  const forms = await getForms(storage, guildId);
  const idx = forms.findIndex((f) => f.id === form.id);
  if (idx >= 0) forms[idx] = form;
  else forms.push(form);
  await storage.set(KEY_FORMS, forms, guildId);
}

export async function deleteForm(storage: AddonStorage, guildId: string, formId: string): Promise<void> {
  const forms = (await getForms(storage, guildId)).filter((f) => f.id !== formId);
  await storage.set(KEY_FORMS, forms, guildId);
}

export async function getSubmissions(storage: AddonStorage, guildId: string): Promise<ApplicationSubmission[]> {
  return (await storage.get<ApplicationSubmission[]>(KEY_SUBMISSIONS, guildId)) ?? [];
}

export async function getSubmission(storage: AddonStorage, guildId: string, submissionId: string): Promise<ApplicationSubmission | null> {
  const subs = await getSubmissions(storage, guildId);
  return subs.find((s) => s.id === submissionId) ?? null;
}

export async function saveSubmission(storage: AddonStorage, guildId: string, sub: ApplicationSubmission): Promise<void> {
  const subs = await getSubmissions(storage, guildId);
  const idx = subs.findIndex((s) => s.id === sub.id);
  if (idx >= 0) subs[idx] = sub;
  else subs.push(sub);
  await storage.set(KEY_SUBMISSIONS, subs, guildId);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
