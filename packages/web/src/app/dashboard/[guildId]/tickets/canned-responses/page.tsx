'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ticketsApi } from '@/lib/api';
import { ArrowLeft, Plus, Pencil, Trash2, MessageSquare, X, Check } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

interface CannedResponse {
  id: string;
  name: string;
  content: string;
  createdByTag: string;
  createdAt: string;
}

export default function CannedResponsesPage() {
  const { guildId } = useParams() as { guildId: string };
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userTag = user ? (user.discriminator === '0' ? user.username : `${user.username}#${user.discriminator}`) : 'Portal';

  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [name, setName]             = useState('');
  const [content, setContent]       = useState('');
  const [error, setError]           = useState('');

  const { data: res, isLoading } = useQuery({
    queryKey: ['canned-responses', guildId],
    queryFn: () => ticketsApi.getCannedResponses(guildId),
  });

  const responses = (res?.data?.data ?? []) as CannedResponse[];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['canned-responses', guildId] });

  const createMut = useMutation({
    mutationFn: () => ticketsApi.createCannedResponse(guildId, { name: name.trim(), content: content.trim(), createdBy: user?.id ?? '', createdByTag: userTag }),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create';
      setError(msg);
    },
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => ticketsApi.updateCannedResponse(guildId, id, { name: name.trim(), content: content.trim() }),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update';
      setError(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => ticketsApi.deleteCannedResponse(guildId, id),
    onSuccess: () => invalidate(),
  });

  function startEdit(r: CannedResponse) {
    setEditingId(r.id);
    setName(r.name);
    setContent(r.content);
    setShowForm(true);
    setError('');
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setContent('');
    setError('');
  }

  function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    setError('');
    if (editingId) {
      updateMut.mutate(editingId);
    } else {
      createMut.mutate();
    }
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/${guildId}/tickets`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-discord-blurple" />
            Canned Responses
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Pre-written responses staff can send with <code className="text-gray-300">/ticket respond</code>
          </p>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setEditingId(null); setName(''); setContent(''); setError(''); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Response
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">{editingId ? 'Edit Response' : 'New Canned Response'}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="space-y-1">
            <label className="text-gray-400 text-xs uppercase tracking-wider">Name</label>
            <input
              className="input w-full"
              placeholder="e.g. greeting, billing-issue, resolved"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
            <p className="text-gray-600 text-xs">This is the autocomplete name used in /ticket respond</p>
          </div>

          <div className="space-y-1">
            <label className="text-gray-400 text-xs uppercase tracking-wider">Content</label>
            <textarea
              className="input w-full min-h-[120px] resize-y"
              placeholder="Hello! Thank you for reaching out. A staff member will be with you shortly..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
            />
            <p className="text-gray-600 text-xs">{content.length}/2000 characters</p>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              <Check className="w-4 h-4" />
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Response'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Response List */}
      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading...</div>
      ) : responses.length === 0 ? (
        <div className="card text-center py-10">
          <MessageSquare className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">No canned responses yet.</p>
          <p className="text-gray-600 text-sm">Create one to let staff send quick replies in ticket channels.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {responses.map((r) => (
            <div key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">{r.name}</span>
                    <span className="badge-secondary text-xs">/{r.name}</span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1 whitespace-pre-wrap break-words line-clamp-3">{r.content}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Created {new Date(r.createdAt).toLocaleDateString()}
                    {r.createdByTag && ` by ${r.createdByTag}`}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(r)}
                    className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-700/50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${r.name}"?`)) deleteMut.mutate(r.id); }}
                    className="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-gray-700/50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage hint */}
      {responses.length > 0 && (
        <div className="card border border-discord-blurple/20 bg-discord-blurple/5">
          <p className="text-gray-400 text-sm">
            <span className="text-white font-medium">How to use:</span> In any ticket channel, run{' '}
            <code className="text-gray-300">/ticket respond</code> and start typing a response name — Discord will
            autocomplete from this list.
          </p>
        </div>
      )}
    </div>
  );
}
