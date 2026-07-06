'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { embedsApi, guildsApi } from '@/lib/api';
import { Layout, Trash2, Send, Plus, Edit2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useRef, useCallback } from 'react';

type EmbedField = { name: string; value: string; inline: boolean };

type GuildEmbed = {
  id: string;
  name: string;
  messageContent: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedUrl: string | null;
  embedTimestamp: boolean;
  embedAuthorName: string | null;
  embedAuthorIconUrl: string | null;
  embedAuthorUrl: string | null;
  embedThumbnailUrl: string | null;
  embedImageUrl: string | null;
  embedFooterText: string | null;
  embedFooterIconUrl: string | null;
  embedFields: EmbedField[];
  createdAt: string;
};

type DiscordChannel = { id: string; name: string; type: number };

type FormState = {
  name: string;
  channelId: string;
  messageContent: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedAuthorName: string;
  embedAuthorIconUrl: string;
  embedAuthorUrl: string;
  embedThumbnailUrl: string;
  embedImageUrl: string;
  embedFooterText: string;
  embedFooterIconUrl: string;
  embedTimestamp: boolean;
  embedFields: EmbedField[];
};

const BLANK: FormState = {
  name: '',
  channelId: '',
  messageContent: '',
  embedTitle: '',
  embedDescription: '',
  embedColor: '#5865F2',
  embedAuthorName: '',
  embedAuthorIconUrl: '',
  embedAuthorUrl: '',
  embedThumbnailUrl: '',
  embedImageUrl: '',
  embedFooterText: '',
  embedFooterIconUrl: '',
  embedTimestamp: false,
  embedFields: [],
};

function embedToForm(e: GuildEmbed): FormState {
  return {
    name: e.name,
    channelId: '',
    messageContent: e.messageContent ?? '',
    embedTitle: e.embedTitle ?? '',
    embedDescription: e.embedDescription ?? '',
    embedColor: e.embedColor ?? '#5865F2',
    embedAuthorName: e.embedAuthorName ?? '',
    embedAuthorIconUrl: e.embedAuthorIconUrl ?? '',
    embedAuthorUrl: e.embedAuthorUrl ?? '',
    embedThumbnailUrl: e.embedThumbnailUrl ?? '',
    embedImageUrl: e.embedImageUrl ?? '',
    embedFooterText: e.embedFooterText ?? '',
    embedFooterIconUrl: e.embedFooterIconUrl ?? '',
    embedTimestamp: e.embedTimestamp,
    embedFields: (e.embedFields as EmbedField[]) ?? [],
  };
}

// ─── Image URL / Upload input ──────────────────────────────────────────────────
function ImageInput({
  label,
  value,
  onChange,
  placeholder = 'https://...',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Image must be under 3 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isData = value.startsWith('data:');

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          value={isData ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isData ? '(uploaded file)' : placeholder}
          disabled={isData}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-secondary text-xs px-3 flex-shrink-0"
        >
          Upload
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            title="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {isData && (
        <img src={value} alt="" className="mt-1.5 h-10 w-10 rounded object-cover border border-gray-700" />
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Discord-style embed preview ──────────────────────────────────────────────
function DiscordPreview({ form }: { form: FormState }) {
  const color = form.embedColor || '#5865F2';
  const hasEmbed =
    form.embedTitle ||
    form.embedDescription ||
    form.embedAuthorName ||
    form.embedImageUrl ||
    form.embedFooterText ||
    form.embedTimestamp ||
    form.embedFields.length > 0;

  return (
    <div className="bg-[#313338] rounded-lg p-4 font-sans text-sm min-h-[120px]">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-discord-blurple flex items-center justify-center text-white font-bold text-sm flex-shrink-0 select-none">
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-white text-sm font-semibold">Arken</span>
            <span className="bg-discord-blurple text-white text-[9px] px-1 py-0.5 rounded font-semibold leading-none">
              APP
            </span>
            <span className="text-gray-500 text-xs">Today at 12:00 PM</span>
          </div>

          {form.messageContent && (
            <p className="text-[#dcddde] text-sm mb-1.5 whitespace-pre-wrap break-words">
              {form.messageContent}
            </p>
          )}

          {hasEmbed && (
            <div
              className="rounded overflow-hidden max-w-[520px]"
              style={{ borderLeft: `4px solid ${color}`, backgroundColor: '#2b2d31' }}
            >
              <div className="p-3">
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    {form.embedAuthorName && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {form.embedAuthorIconUrl && !form.embedAuthorIconUrl.startsWith('data:') && (
                          <img
                            src={form.embedAuthorIconUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {form.embedAuthorIconUrl?.startsWith('data:') && (
                          <img src={form.embedAuthorIconUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                        )}
                        <span className="text-white text-xs font-semibold break-words">{form.embedAuthorName}</span>
                      </div>
                    )}

                    {form.embedTitle && (
                      <p className="text-white font-semibold text-sm break-words mb-0.5">{form.embedTitle}</p>
                    )}

                    {form.embedDescription && (
                      <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words mt-0.5">
                        {form.embedDescription}
                      </p>
                    )}
                  </div>

                  {form.embedThumbnailUrl && (
                    <img
                      src={form.embedThumbnailUrl}
                      alt="thumbnail"
                      className="w-16 h-16 rounded object-cover flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>

                {form.embedFields.length > 0 && (
                  <div className="mt-2 grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {form.embedFields.map((f, i) => (
                      <div key={i} className={f.inline ? '' : 'col-span-3'}>
                        <p className="text-white text-xs font-semibold mb-0.5">{f.name || 'Field Name'}</p>
                        <p className="text-[#dbdee1] text-xs break-words">{f.value || 'Field Value'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {form.embedImageUrl && (
                  <img
                    src={form.embedImageUrl}
                    alt="embed image"
                    className="w-full rounded mt-2 max-h-64 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                {(form.embedFooterText || form.embedTimestamp) && (
                  <div className="flex items-center gap-1.5 mt-2 border-t border-white/5 pt-2">
                    {form.embedFooterIconUrl && (
                      <img
                        src={form.embedFooterIconUrl}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <span className="text-[#949ba4] text-xs break-words">
                      {[
                        form.embedFooterText,
                        form.embedTimestamp ? new Date().toLocaleString() : '',
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!hasEmbed && !form.messageContent && (
            <p className="text-gray-600 text-xs italic">Your embed preview will appear here…</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EmbedsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const { data: embedsRes, isLoading } = useQuery({
    queryKey: ['embeds', guildId],
    queryFn: () => embedsApi.list(guildId),
  });

  const { data: channelsRes } = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => guildsApi.channels(guildId),
  });

  const embeds: GuildEmbed[] =
    (embedsRes?.data as { data?: GuildEmbed[] })?.data ?? [];
  const allChannels =
    (channelsRes?.data as { data?: DiscordChannel[] })?.data ?? [];
  const textChannels = allChannels.filter((c) => c.type === 0);

  const createMutation = useMutation({
    mutationFn: (data: object) => embedsApi.create(guildId, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
      const created = (res.data as { data?: GuildEmbed })?.data;
      if (created) setEditingId(created.id);
      toast.success('Embed saved');
    },
    onError: () => toast.error('Failed to save embed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      embedsApi.update(guildId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
      toast.success('Embed saved');
    },
    onError: () => toast.error('Failed to save embed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => embedsApi.delete(guildId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
      toast.success('Embed deleted');
    },
    onError: () => toast.error('Failed to delete embed'),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, channelId }: { id: string; channelId: string }) =>
      embedsApi.send(guildId, id, channelId),
    onSuccess: () => toast.success('Embed sent to channel!'),
    onError: () => toast.error('Failed to send embed'),
  });

  const resetForm = () => {
    setForm({ ...BLANK });
    setEditingId(null);
  };

  const loadEmbed = (embed: GuildEmbed) => {
    setForm(embedToForm(embed));
    setEditingId(embed.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    messageContent: form.messageContent || null,
    embedTitle: form.embedTitle || null,
    embedDescription: form.embedDescription || null,
    embedColor: form.embedColor || null,
    embedTimestamp: form.embedTimestamp,
    embedAuthorName: form.embedAuthorName || null,
    embedAuthorIconUrl: form.embedAuthorIconUrl || null,
    embedAuthorUrl: form.embedAuthorUrl || null,
    embedThumbnailUrl: form.embedThumbnailUrl || null,
    embedImageUrl: form.embedImageUrl || null,
    embedFooterText: form.embedFooterText || null,
    embedFooterIconUrl: form.embedFooterIconUrl || null,
    embedFields: form.embedFields,
  });

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Embed name is required');
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handlePublish = async () => {
    if (!form.name.trim()) return toast.error('Embed name is required');
    if (!form.channelId) return toast.error('Select a channel to publish to');

    // Save the embed first (creating it if new) so it has a stable ID before sending.
    const payload = buildPayload();
    let targetId = editingId;

    if (!targetId) {
      const res = await embedsApi.create(guildId, payload);
      const created = (res.data as { data?: GuildEmbed })?.data;
      if (!created) return toast.error('Failed to save embed');
      targetId = created.id;
      setEditingId(targetId);
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
    } else {
      await embedsApi.update(guildId, targetId, payload);
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
    }

    sendMutation.mutate({ id: targetId, channelId: form.channelId });
  };

  const addField = () =>
    set('embedFields', [...form.embedFields, { name: '', value: '', inline: false }]);

  const updateField = (i: number, patch: Partial<EmbedField>) =>
    set('embedFields', form.embedFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const removeField = (i: number) =>
    set('embedFields', form.embedFields.filter((_, idx) => idx !== i));

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-3 sm:p-6 max-w-7xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="page-head">
        <div className="page-head-icon"><Layout className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Embed Builder</h1>
          <div className="page-head-desc">Create and send rich Discord embeds from the dashboard.</div>
        </div>
      </div>
        {editingId && (
          <button onClick={resetForm} className="btn-secondary gap-1.5 text-sm">
            <Plus className="w-4 h-4" />
            New Embed
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 mb-6">
        <div className="card space-y-5">
          <h2 className="text-lg font-semibold text-white">
            {editingId ? 'Edit Embed' : 'New Embed'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Embed Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Content Creator Rules"
                maxLength={100}
              />
            </div>
            <div>
              <label className="label">Target Channel (for Publish)</label>
              <select
                className="input"
                value={form.channelId}
                onChange={(e) => set('channelId', e.target.value)}
              >
                <option value="">Select a channel</option>
                {textChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Message Content (above embed, optional)</label>
            <textarea
              className="input min-h-[60px] resize-y"
              value={form.messageContent}
              onChange={(e) => set('messageContent', e.target.value)}
              placeholder="Optional plain text message sent above the embed…"
            />
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Embed Content</h3>
            <div className="flex gap-3 items-end mb-4">
              <div className="flex-shrink-0">
                <label className="label">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
                    value={form.embedColor}
                    onChange={(e) => set('embedColor', e.target.value)}
                  />
                  <input
                    type="text"
                    className="input w-24"
                    value={form.embedColor}
                    onChange={(e) => set('embedColor', e.target.value)}
                    placeholder="#5865F2"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="label">Title</label>
                <input
                  className="input"
                  value={form.embedTitle}
                  onChange={(e) => set('embedTitle', e.target.value)}
                  placeholder="Embed title"
                  maxLength={256}
                />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[100px] resize-y"
                value={form.embedDescription}
                onChange={(e) => set('embedDescription', e.target.value)}
                placeholder="Write your embed description here…"
                maxLength={4096}
              />
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Author</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Author Name</label>
                <input
                  className="input"
                  value={form.embedAuthorName}
                  onChange={(e) => set('embedAuthorName', e.target.value)}
                  placeholder="Author name"
                  maxLength={256}
                />
              </div>
              <ImageInput
                label="Author Icon"
                value={form.embedAuthorIconUrl}
                onChange={(v) => set('embedAuthorIconUrl', v)}
              />
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Images</h3>
            <div className="space-y-4">
              <ImageInput
                label="Thumbnail (top-right corner)"
                value={form.embedThumbnailUrl}
                onChange={(v) => set('embedThumbnailUrl', v)}
              />
              <ImageInput
                label="Main Image (large, below description)"
                value={form.embedImageUrl}
                onChange={(v) => set('embedImageUrl', v)}
              />
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Footer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="label">Footer Text</label>
                <input
                  className="input"
                  value={form.embedFooterText}
                  onChange={(e) => set('embedFooterText', e.target.value)}
                  placeholder="Footer text"
                  maxLength={2048}
                />
              </div>
              <ImageInput
                label="Footer Icon"
                value={form.embedFooterIconUrl}
                onChange={(v) => set('embedFooterIconUrl', v)}
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-600 bg-[var(--bg-base)] text-discord-blurple focus:ring-discord-blurple focus:ring-offset-discord-darkest-bg"
                checked={form.embedTimestamp}
                onChange={(e) => set('embedTimestamp', e.target.checked)}
              />
              <span className="text-sm text-gray-300">Include current timestamp</span>
            </label>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300">
                Fields ({form.embedFields.length}/25)
              </h3>
              {form.embedFields.length < 25 && (
                <button type="button" onClick={addField} className="btn-secondary text-xs px-2.5 py-1.5 gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Add Field
                </button>
              )}
            </div>
            {form.embedFields.length > 0 && (
              <div className="space-y-3">
                {form.embedFields.map((field, i) => (
                  <div key={i} className="bg-[var(--bg-base)] rounded-md p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input
                          className="input text-xs"
                          value={field.name}
                          onChange={(e) => updateField(i, { name: e.target.value })}
                          placeholder="Field name"
                          maxLength={256}
                        />
                        <input
                          className="input text-xs"
                          value={field.value}
                          onChange={(e) => updateField(i, { value: e.target.value })}
                          placeholder="Field value"
                          maxLength={1024}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeField(i)}
                        className="text-gray-500 hover:text-red-400 transition-colors mt-2 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-600 bg-[var(--bg-base)] text-discord-blurple focus:ring-discord-blurple"
                        checked={field.inline}
                        onChange={(e) => updateField(i, { inline: e.target.checked })}
                      />
                      <span className="text-xs text-gray-400">Inline</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn-secondary"
            >
              {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Embed'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSaving || sendMutation.isPending}
              className="btn-primary gap-2"
            >
              <Send className="w-4 h-4" />
              {sendMutation.isPending ? 'Publishing…' : 'Save & Publish'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn text-gray-400 hover:text-gray-200">
                Discard
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Live Preview
            </h2>
            <DiscordPreview form={form} />
          </div>
          <p className="text-xs text-gray-600 text-center px-2">
            Preview is approximate. Final appearance may vary slightly in Discord.
          </p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-white">Saved Embeds</h2>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : embeds.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Layout className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No embeds saved yet. Create one above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-[var(--bg-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Preview
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {embeds.map((embed) => (
                  <tr
                    key={embed.id}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      editingId === embed.id ? 'bg-discord-blurple/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: embed.embedColor ?? '#5865F2' }}
                        />
                        <span className="text-sm text-white font-medium">{embed.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[240px] truncate">
                      {embed.embedTitle || embed.embedDescription || embed.messageContent || (
                        <span className="italic text-gray-600">no content</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(embed.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => loadEmbed(embed)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Edit embed"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <SendRowButton
                          embed={embed}
                          textChannels={textChannels}
                          onSend={(channelId) =>
                            sendMutation.mutate({ id: embed.id, channelId })
                          }
                          isSending={sendMutation.isPending}
                        />
                        <button
                          onClick={() => {
                            if (editingId === embed.id) resetForm();
                            deleteMutation.mutate(embed.id);
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete embed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline send button with channel picker ───────────────────────────────────
function SendRowButton({
  embed,
  textChannels,
  onSend,
  isSending,
}: {
  embed: GuildEmbed;
  textChannels: DiscordChannel[];
  onSend: (channelId: string) => void;
  isSending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-discord-blurple transition-colors"
        title="Send to channel"
      >
        <Send className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        className="input text-xs py-1 px-2 w-36"
        value={channelId}
        onChange={(e) => setChannelId(e.target.value)}
        autoFocus
      >
        <option value="">Pick channel…</option>
        {textChannels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            #{ch.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!channelId) return;
          onSend(channelId);
          setOpen(false);
          setChannelId('');
        }}
        disabled={!channelId || isSending}
        className="btn-primary text-xs px-2 py-1"
      >
        Send
      </button>
      <button
        onClick={() => { setOpen(false); setChannelId(''); }}
        className="text-gray-500 hover:text-gray-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
