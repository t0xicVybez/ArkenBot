'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ticketsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Edit, X, ChevronDown, ChevronUp, LayoutTemplate } from 'lucide-react';
import { randomUUID } from 'crypto'; // available client-side via Next.js/webpack polyfill

// ─── Types ────────────────────────────────────────────────────────────────────

interface PanelButton { id: string; label: string; emoji: string; color: string; categoryTag?: string; staffRoles?: string[]; }

interface PanelField {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  style: 'short' | 'paragraph';
  maxLength?: number;
}

interface TicketPanel {
  id: string; name: string; description: string; emoji: string;
  channelId?: string; messageId?: string; categoryId?: string; logChannelId?: string;
  staffRoles: string[]; maxTicketsPerUser: number; namingPattern: string;
  closeAction: string; autoCloseHours: number; requireReason: boolean;
  welcomeMessage: string; buttonLabel: string; buttonColor: string;
  buttons?: PanelButton[];
  ticketMode: 'channel' | 'thread';
  fields?: PanelField[];
  embedColor?: string; embedAuthorName?: string; embedAuthorIconUrl?: string;
  embedThumbnailUrl?: string; embedImageUrl?: string; embedFooterText?: string; embedFooterIconUrl?: string;
  enabled: boolean; createdAt: string;
}

type PanelDraft = Omit<TicketPanel, 'id' | 'createdAt'> & { id?: string };

const BUTTON_COLORS: { label: string; value: string; hex: string }[] = [
  { label: 'Blurple', value: 'primary',   hex: '#5865f2' },
  { label: 'Grey',    value: 'secondary', hex: '#4f545c' },
  { label: 'Green',   value: 'success',   hex: '#57f287' },
  { label: 'Red',     value: 'danger',    hex: '#ed4245' },
];

const DEFAULT_DRAFT: PanelDraft = {
  name: '', description: '', emoji: '🎫',
  buttonLabel: 'Open a Ticket', buttonColor: 'primary',
  buttons: [],
  ticketMode: 'channel',
  fields: [],
  staffRoles: [], maxTicketsPerUser: 1,
  namingPattern: 'ticket-{number}', closeAction: 'delete',
  autoCloseHours: 48, requireReason: false,
  welcomeMessage: 'Welcome {user}! A staff member will be with you shortly.',
  embedColor: '#5865F2', enabled: true,
};

// ─── Staff Roles Input ────────────────────────────────────────────────────────

function StaffRolesInput({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = () => {
    const id = input.trim().replace(/\D/g, '');
    if (!id || roles.includes(id)) { setInput(''); return; }
    onChange([...roles, id]);
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm font-mono"
          placeholder="Paste a Role ID and press Add"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" onClick={add} className="btn-secondary text-sm px-3">Add</button>
      </div>
      {roles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((id) => (
            <span key={id} className="flex items-center gap-1 bg-gray-700/50 text-gray-200 text-xs font-mono rounded px-2 py-1">
              {id}
              <button type="button" onClick={() => onChange(roles.filter((r) => r !== id))} className="text-gray-500 hover:text-red-400 ml-1">×</button>
            </span>
          ))}
        </div>
      )}
      <p className="text-gray-600 text-xs">Enable Developer Mode in Discord (Settings → Advanced) to copy Role IDs.</p>
    </div>
  );
}

// ─── Embed Preview ────────────────────────────────────────────────────────────

function EmbedPreview({ draft }: { draft: PanelDraft }) {
  const color = draft.embedColor ?? '#5865F2';
  const activeButtons = draft.buttons && draft.buttons.length > 0 ? draft.buttons : [{
    id: 'default', label: draft.buttonLabel || 'Open a Ticket',
    emoji: draft.emoji || '', color: draft.buttonColor || 'primary',
  }];

  const btnHex = (c: string) => BUTTON_COLORS.find((b) => b.value === c)?.hex ?? '#5865f2';

  return (
    <div className="bg-[#36393f] rounded-lg overflow-hidden border border-gray-600 text-sm font-sans">
      {/* Embed */}
      <div className="flex p-3 gap-3" style={{ borderLeft: `4px solid ${color}` }}>
        {draft.embedAuthorIconUrl && (
          <img src={draft.embedAuthorIconUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          {draft.embedAuthorName && (
            <p className="text-[#dcddde] text-xs font-semibold mb-1">{draft.embedAuthorName}</p>
          )}
          <p className="text-white font-bold text-sm mb-1">
            {draft.emoji ? `${draft.emoji} ` : ''}{draft.name || 'Panel Name'}
          </p>
          <p className="text-[#dcddde] text-xs leading-relaxed whitespace-pre-wrap break-words">
            {draft.description || 'Panel description goes here.'}
          </p>
          {draft.embedImageUrl && (
            <img src={draft.embedImageUrl} alt="embed" className="mt-2 max-w-full rounded max-h-48 object-cover" />
          )}
          {(draft.embedFooterText) && (
            <div className="flex items-center gap-1 mt-2">
              {draft.embedFooterIconUrl && <img src={draft.embedFooterIconUrl} alt="" className="w-4 h-4 rounded-full" />}
              <p className="text-[#72767d] text-xs">{draft.embedFooterText}</p>
            </div>
          )}
        </div>
        {draft.embedThumbnailUrl && (
          <img src={draft.embedThumbnailUrl} alt="thumb" className="w-16 h-16 rounded object-cover flex-shrink-0" />
        )}
      </div>
      {/* Buttons */}
      <div className="px-3 pb-3 flex flex-wrap gap-2">
        {activeButtons.map((b) => (
          <button
            key={b.id}
            className="px-3 py-1.5 rounded text-white text-xs font-medium"
            style={{ background: btnHex(b.color) }}
          >
            {b.emoji ? `${b.emoji} ` : ''}{b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Button Editor Row ────────────────────────────────────────────────────────

function ButtonStaffRoles({ roles, onChange }: { roles: string[]; onChange: (r: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const id = input.trim().replace(/\D/g, '');
    if (!id || roles.includes(id)) { setInput(''); return; }
    onChange([...roles, id]);
    setInput('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {roles.map((id) => (
        <span key={id} className="flex items-center gap-1 bg-gray-600/50 text-gray-300 text-xs font-mono rounded px-1.5 py-0.5">
          {id}
          <button type="button" onClick={() => onChange(roles.filter((r) => r !== id))} className="text-gray-500 hover:text-red-400">×</button>
        </span>
      ))}
      <div className="flex gap-1">
        <input
          className="input text-xs py-0.5 font-mono"
          placeholder="Role ID"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ width: 120 }}
        />
        <button type="button" onClick={add} className="btn-secondary text-xs px-2 py-0.5">+</button>
      </div>
    </div>
  );
}

function ButtonRow({
  btn, onChange, onDelete,
}: { btn: PanelButton; onChange: (b: PanelButton) => void; onDelete: () => void }) {
  return (
    <div className="bg-gray-700/30 rounded-lg p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="input flex-1 text-sm py-1.5"
          placeholder="Emoji"
          value={btn.emoji}
          onChange={(e) => onChange({ ...btn, emoji: e.target.value })}
          style={{ width: 60, flex: 'none' }}
        />
        <input
          className="input flex-1 text-sm py-1.5"
          placeholder="Button label"
          value={btn.label}
          onChange={(e) => onChange({ ...btn, label: e.target.value })}
        />
        <select
          className="input text-sm py-1.5"
          value={btn.color}
          onChange={(e) => onChange({ ...btn, color: e.target.value })}
          style={{ width: 110, flex: 'none' }}
        >
          {BUTTON_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          className="input text-sm py-1.5"
          placeholder="Category tag"
          value={btn.categoryTag ?? ''}
          onChange={(e) => onChange({ ...btn, categoryTag: e.target.value || undefined })}
          style={{ width: 130, flex: 'none' }}
        />
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 flex-shrink-0 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="pl-1">
        <p className="text-gray-500 text-xs mb-0.5">Staff roles for this button (overrides panel roles):</p>
        <ButtonStaffRoles
          roles={btn.staffRoles ?? []}
          onChange={(r) => onChange({ ...btn, staffRoles: r.length > 0 ? r : undefined })}
        />
      </div>
    </div>
  );
}

// ─── Field Editor ─────────────────────────────────────────────────────────────

function FieldRow({ field, onChange, onDelete }: { field: PanelField; onChange: (f: PanelField) => void; onDelete: () => void }) {
  return (
    <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="input flex-1 text-sm py-1.5"
          placeholder="Field label *"
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          maxLength={45}
        />
        <select
          className="input text-sm py-1.5"
          value={field.style}
          onChange={(e) => onChange({ ...field, style: e.target.value as 'short' | 'paragraph' })}
          style={{ width: 120, flex: 'none' }}
        >
          <option value="short">Short</option>
          <option value="paragraph">Paragraph</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="accent-discord-blurple"
          />
          Required
        </label>
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 flex-shrink-0 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input text-sm py-1.5"
          placeholder="Placeholder text (optional)"
          value={field.placeholder ?? ''}
          onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })}
        />
        <input
          type="number"
          className="input text-sm py-1.5"
          placeholder="Max length (optional)"
          min={1}
          max={4000}
          value={field.maxLength ?? ''}
          onChange={(e) => onChange({ ...field, maxLength: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    </div>
  );
}

// ─── Panel Form (create / edit) ───────────────────────────────────────────────

function PanelForm({
  guildId,
  initial,
  onDone,
}: { guildId: string; initial?: TicketPanel; onDone: () => void }) {
  const [draft, setDraft] = useState<PanelDraft>(initial ? { ...initial } : { ...DEFAULT_DRAFT });
  const [section, setSection] = useState<'embed' | 'buttons' | 'fields' | 'settings'>('embed');
  const queryClient = useQueryClient();

  const set = <K extends keyof PanelDraft>(key: K, value: PanelDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () =>
      initial
        ? ticketsApi.updatePanel(guildId, initial.id, draft)
        : ticketsApi.createPanel(guildId, draft),
    onSuccess: () => {
      toast.success(initial ? 'Panel updated!' : 'Panel created!');
      queryClient.invalidateQueries({ queryKey: ['tickets-panels', guildId] });
      onDone();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Failed to save panel.');
    },
  });

  const addButton = () =>
    set('buttons', [
      ...(draft.buttons ?? []),
      { id: crypto.randomUUID(), label: 'Open Ticket', emoji: '🎫', color: 'primary' },
    ]);

  const updateButton = (id: string, updated: PanelButton) =>
    set('buttons', (draft.buttons ?? []).map((b) => (b.id === id ? updated : b)));

  const removeButton = (id: string) =>
    set('buttons', (draft.buttons ?? []).filter((b) => b.id !== id));

  const addField = () => {
    if ((draft.fields ?? []).length >= 5) { toast.error('Maximum 5 fields per panel'); return; }
    set('fields', [
      ...(draft.fields ?? []),
      { id: crypto.randomUUID(), label: '', placeholder: undefined, required: false, style: 'short' as const },
    ]);
  };
  const updateField = (id: string, updated: PanelField) =>
    set('fields', (draft.fields ?? []).map((f) => (f.id === id ? updated : f)));
  const removeField = (id: string) =>
    set('fields', (draft.fields ?? []).filter((f) => f.id !== id));

  const tabs = ['embed', 'buttons', 'fields', 'settings'] as const;

  return (
    <div className="flex gap-6 h-full">
      {/* Left: form */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto pr-1">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[var(--border-subtle)] pb-0">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setSection(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                section === t
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Embed tab ── */}
        {section === 'embed' && (
          <div className="space-y-3">
            <Row label="Panel Name *">
              <input className="input" placeholder="e.g. Support" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={50} />
            </Row>
            <Row label="Description *">
              <textarea
                className="input h-20 resize-none"
                placeholder="Text shown inside the panel embed"
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={1024}
              />
              <p className="text-gray-600 text-xs text-right">{draft.description.length}/1024</p>
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Embed Color">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
                    value={draft.embedColor ?? '#5865F2'}
                    onChange={(e) => set('embedColor', e.target.value)}
                  />
                  <input
                    className="input flex-1 font-mono text-sm"
                    placeholder="#5865F2"
                    value={draft.embedColor ?? ''}
                    onChange={(e) => set('embedColor', e.target.value)}
                  />
                </div>
              </Row>
              <Row label="Emoji">
                <input className="input" placeholder="🎫" value={draft.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={10} />
              </Row>
            </div>
            <Row label="Author Name">
              <input className="input" placeholder="Optional author line above title" value={draft.embedAuthorName ?? ''} onChange={(e) => set('embedAuthorName', e.target.value || undefined)} />
            </Row>
            <Row label="Author Icon URL">
              <input className="input" placeholder="https://..." value={draft.embedAuthorIconUrl ?? ''} onChange={(e) => set('embedAuthorIconUrl', e.target.value || undefined)} />
            </Row>
            <Row label="Thumbnail URL">
              <input className="input" placeholder="https://... (small image top-right)" value={draft.embedThumbnailUrl ?? ''} onChange={(e) => set('embedThumbnailUrl', e.target.value || undefined)} />
            </Row>
            <Row label="Image URL">
              <input className="input" placeholder="https://... (large image below description)" value={draft.embedImageUrl ?? ''} onChange={(e) => set('embedImageUrl', e.target.value || undefined)} />
            </Row>
            <Row label="Footer Text">
              <input className="input" placeholder="Optional footer text" value={draft.embedFooterText ?? ''} onChange={(e) => set('embedFooterText', e.target.value || undefined)} />
            </Row>
            <Row label="Footer Icon URL">
              <input className="input" placeholder="https://..." value={draft.embedFooterIconUrl ?? ''} onChange={(e) => set('embedFooterIconUrl', e.target.value || undefined)} />
            </Row>
          </div>
        )}

        {/* ── Buttons tab ── */}
        {section === 'buttons' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Add multiple buttons to the panel. Each button can have a different category tag applied to tickets it opens. Leave empty to use a single default button.
            </p>

            {(draft.buttons ?? []).length === 0 && (
              <div className="space-y-3 border border-[var(--border-subtle)] rounded-lg p-3">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Default Button</p>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Button Label">
                    <input className="input text-sm" value={draft.buttonLabel} onChange={(e) => set('buttonLabel', e.target.value)} maxLength={80} />
                  </Row>
                  <Row label="Button Color">
                    <select className="input text-sm" value={draft.buttonColor} onChange={(e) => set('buttonColor', e.target.value)}>
                      {BUTTON_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </Row>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(draft.buttons ?? []).map((btn) => (
                <ButtonRow
                  key={btn.id}
                  btn={btn}
                  onChange={(updated) => updateButton(btn.id, updated)}
                  onDelete={() => removeButton(btn.id)}
                />
              ))}
            </div>

            {(draft.buttons ?? []).length < 25 && (
              <button onClick={addButton} className="btn-secondary text-sm flex items-center gap-2 w-full justify-center">
                <Plus className="w-3.5 h-3.5" /> Add Button
              </button>
            )}
          </div>
        )}

        {/* ── Fields tab ── */}
        {section === 'fields' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              When a user opens a ticket via this panel, they'll be shown a modal with these fields to fill in. Up to 5 fields. Responses are saved to the ticket and shown in the transcript.
            </p>
            {(draft.fields ?? []).length === 0 && (
              <div className="text-center py-6 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
                No fields yet — users just click the button and the ticket opens.
              </div>
            )}
            <div className="space-y-2">
              {(draft.fields ?? []).map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  onChange={(updated) => updateField(field.id, updated)}
                  onDelete={() => removeField(field.id)}
                />
              ))}
            </div>
            {(draft.fields ?? []).length < 5 && (
              <button onClick={addField} className="btn-secondary text-sm flex items-center gap-2 w-full justify-center">
                <Plus className="w-3.5 h-3.5" /> Add Field
              </button>
            )}
          </div>
        )}

        {/* ── Settings tab ── */}
        {section === 'settings' && (
          <div className="space-y-3">
            <Row label="Staff Roles">
              <StaffRolesInput
                roles={draft.staffRoles}
                onChange={(roles) => set('staffRoles', roles)}
              />
            </Row>
            <Row label="Welcome Message">
              <textarea
                className="input h-20 resize-none text-sm"
                placeholder="Welcome {user}! Placeholders: {user}, {username}, {number}"
                value={draft.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                maxLength={1024}
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Ticket Mode">
                <select className="input" value={draft.ticketMode} onChange={(e) => set('ticketMode', e.target.value as 'channel' | 'thread')}>
                  <option value="channel">Private Channel</option>
                  <option value="thread">Private Thread</option>
                </select>
              </Row>
              <Row label="Max Tickets / User">
                <input type="number" className="input" min={1} max={10} value={draft.maxTicketsPerUser} onChange={(e) => set('maxTicketsPerUser', Number(e.target.value))} />
              </Row>
              <Row label="Auto-close (hours, 0 = off)">
                <input type="number" className="input" min={0} max={720} value={draft.autoCloseHours} onChange={(e) => set('autoCloseHours', Number(e.target.value))} />
              </Row>
              <Row label="Channel Naming Pattern">
                <input className="input text-sm" placeholder="ticket-{number}" value={draft.namingPattern} onChange={(e) => set('namingPattern', e.target.value)} />
              </Row>
              <Row label="Close Action">
                <select className="input" value={draft.closeAction} onChange={(e) => set('closeAction', e.target.value)}>
                  <option value="delete">Delete channel</option>
                  <option value="archive">Archive channel</option>
                </select>
              </Row>
            </div>
            <Row label="Require Reason">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-11 h-6 rounded-full transition-colors ${draft.requireReason ? 'bg-discord-blurple' : 'bg-gray-600'} relative`}
                  onClick={() => set('requireReason', !draft.requireReason)}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${draft.requireReason ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
                <span className="text-gray-300 text-sm">{draft.requireReason ? 'Yes — ask for reason' : 'No'}</span>
              </label>
            </Row>
            <Row label="Enabled">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-11 h-6 rounded-full transition-colors ${draft.enabled ? 'bg-discord-blurple' : 'bg-gray-600'} relative`}
                  onClick={() => set('enabled', !draft.enabled)}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
                <span className="text-gray-300 text-sm">{draft.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </Row>
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-gray-500 text-xs mb-2">Discord IDs — leave blank if managing via slash commands</p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'categoryId', label: 'Category ID (for ticket channels)' },
                  { key: 'logChannelId', label: 'Log Channel ID' },
                ] .map(({ key, label }) => (
                  <Row key={key} label={label}>
                    <input
                      className="input text-sm font-mono"
                      placeholder="Discord channel/category ID"
                      value={(draft as Record<string, unknown>)[key] as string ?? ''}
                      onChange={(e) => set(key as keyof PanelDraft, e.target.value || undefined as never)}
                    />
                  </Row>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-3 pt-2 border-t border-[var(--border-subtle)] sticky bottom-0 bg-discord-dark-bg py-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !draft.name.trim() || !draft.description.trim()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Panel'}
          </button>
          <button onClick={onDone} className="btn-secondary">Cancel</button>
        </div>
      </div>

      {/* Right: live preview */}
      <div className="w-80 flex-shrink-0 space-y-3 hidden lg:block">
        <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Live Preview</p>
        <EmbedPreview draft={draft} />
        <div className="card text-xs text-gray-500 space-y-1">
          <p>✅ Changes are saved to the portal database.</p>
          <p>📌 To post this panel in Discord, use:</p>
          <code className="block bg-gray-700/40 rounded px-2 py-1 text-discord-blurple font-mono">/ticket-setup panel send</code>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PanelsPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient  = useQueryClient();
  const [editing, setEditing] = useState<TicketPanel | null | 'new'>(null);

  const { data: panelsRes, isLoading } = useQuery({
    queryKey: ['tickets-panels', guildId],
    queryFn:  () => ticketsApi.getPanels(guildId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ticketsApi.deletePanel(guildId, id),
    onSuccess: () => {
      toast.success('Panel deleted.');
      queryClient.invalidateQueries({ queryKey: ['tickets-panels', guildId] });
    },
    onError: () => toast.error('Failed to delete panel.'),
  });

  const panels = (panelsRes?.data?.data ?? []) as TicketPanel[];

  // ── Form view ──
  if (editing !== null) {
    return (
      <div className="p-3 sm:p-6 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-white">
            {editing === 'new' ? 'Create Panel' : `Edit — ${(editing as TicketPanel).name}`}
          </h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <PanelForm
            guildId={guildId}
            initial={editing === 'new' ? undefined : (editing as TicketPanel)}
            onDone={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="page-head">
        <div className="page-head-icon"><LayoutTemplate className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1>Ticket Panels</h1>
          <div className="page-head-desc">{panels.length} panel{panels.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Panel
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading panels...</div>
      ) : panels.length === 0 ? (
        <div className="card text-center py-16">
          <LayoutTemplate className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">No panels yet</p>
          <p className="text-gray-400 text-sm mb-4">Create your first ticket panel to get started.</p>
          <button onClick={() => setEditing('new')} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Create Panel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {panels.map((panel) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              onEdit={() => setEditing(panel)}
              onDelete={() => {
                if (confirm(`Delete panel "${panel.name}"?`)) deleteMutation.mutate(panel.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Slash command reminder */}
      <div className="card border-gray-700/30 bg-gray-700/10 text-sm text-gray-400 space-y-1">
        <p className="text-gray-300 font-medium">After creating or editing a panel:</p>
        <p>Use <code className="bg-gray-700/60 px-1.5 rounded text-discord-blurple font-mono">/ticket-setup panel send #channel panel-name</code> in Discord to post it.</p>
      </div>
    </div>
  );
}

// ─── Panel Card ───────────────────────────────────────────────────────────────

function PanelCard({ panel, onEdit, onDelete }: { panel: TicketPanel; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const buttonCount = panel.buttons?.length ?? 0;

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-2xl">{panel.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-semibold truncate">{panel.name}</h3>
            {panel.enabled
              ? <span className="badge-success text-xs">Active</span>
              : <span className="badge-secondary text-xs">Disabled</span>}
          </div>
          <p className="text-gray-400 text-xs line-clamp-2 mt-0.5">{panel.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Chip label="Mode" value={panel.ticketMode === 'thread' ? 'Thread' : 'Channel'} />
        <Chip label="Buttons"  value={buttonCount > 0 ? String(buttonCount) : '1 (default)'} />
        <Chip label="Auto-close" value={panel.autoCloseHours > 0 ? `${panel.autoCloseHours}h` : 'Off'} />
        <Chip label="Max/user" value={String(panel.maxTicketsPerUser)} />
      </div>

      {/* Embed preview toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-gray-500 text-xs flex items-center gap-1 hover:text-gray-300 transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? 'Hide preview' : 'Show embed preview'}
      </button>

      {open && (
        <EmbedPreview draft={panel} />
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-[var(--border-subtle)]">
        <button onClick={onEdit} className="btn-secondary flex-1 text-xs py-1.5 flex items-center justify-center gap-1.5">
          <Edit className="w-3 h-3" /> Edit
        </button>
        <button onClick={onDelete} className="btn-danger text-xs py-1.5 px-3">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-700/30 rounded p-1.5 text-center">
      <p className="text-gray-500">{label}</p>
      <p className="text-gray-200 font-medium truncate">{value}</p>
    </div>
  );
}
