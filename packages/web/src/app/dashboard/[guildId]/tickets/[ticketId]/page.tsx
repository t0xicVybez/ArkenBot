'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ticketsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import { ArrowLeft, RefreshCw, AlertTriangle, Clock, Tag, StickyNote, UserCheck, ArrowRightLeft, Trash2, Send, Download } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketNote {
  id: string;
  authorId: string;
  authorTag: string;
  content: string;
  createdAt: string;
}

interface TicketRecord {
  id: string;
  number: number;
  userId: string;
  username: string;
  status: 'open' | 'claimed' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  panelId: string;
  tags: string[];
  claimedBy?: string;
  claimedByTag?: string;
  transferredTo?: string;
  transferredToTag?: string;
  closedBy?: string;
  closedByTag?: string;
  closedAt?: string;
  reason?: string;
  rating?: number;
  ratingFeedback?: string;
  notes: TicketNote[];

  createdAt: string;
  lastActivity: string;
  firstResponseAt?: string;
  categoryTag?: string;
}

interface TicketMessage {
  authorId: string;
  authorTag: string;
  content: string;
  attachments: string[];
  timestamp: string;
}

interface TicketPanel {
  id: string;
  name: string;
  emoji: string;
  closeAction?: 'delete' | 'archive';
}

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: 'text-green-400',  bg: 'bg-green-400/10' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  high:   { label: 'High',   color: 'text-orange-400', bg: 'bg-orange-400/10' },
  urgent: { label: 'Urgent', color: 'text-red-400',    bg: 'bg-red-400/10' },
};

const STATUS_BADGE: Record<string, string> = {
  open: 'badge-success',
  claimed: 'badge-info',
  closed: 'badge-secondary',
};

// ─── Status Timeline ──────────────────────────────────────────────────────────

function Timeline({ ticket }: { ticket: TicketRecord }) {
  const events: { time: string; label: string; color: string }[] = [
    { time: ticket.createdAt, label: `Opened by ${ticket.username}`, color: 'bg-green-400' },
  ];
  if (ticket.firstResponseAt) {
    events.push({ time: ticket.firstResponseAt, label: `First staff response`, color: 'bg-blue-400' });
  }
  if (ticket.claimedByTag) {
    // We don't store claimed timestamp separately, so skip if no data
  }
  if (ticket.transferredToTag) {
    events.push({ time: ticket.lastActivity, label: `Transferred to ${ticket.transferredToTag}`, color: 'bg-purple-400' });
  }
  if (ticket.closedAt) {
    events.push({ time: ticket.closedAt, label: `Closed by ${ticket.closedByTag ?? 'staff'}`, color: 'bg-red-400' });
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="relative ml-2">
      {events.map((ev, i) => (
        <div key={i} className="flex gap-3 mb-3 last:mb-0">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${ev.color}`} />
            {i < events.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
          </div>
          <div className="pb-1">
            <p className="text-gray-300 text-sm">{ev.label}</p>
            <p className="text-gray-500 text-xs">{new Date(ev.time).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const { guildId, ticketId } = useParams() as { guildId: string; ticketId: string };
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userTag = user ? (user.discriminator === '0' ? user.username : `${user.username}#${user.discriminator}`) : 'Staff Portal';

  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [transferTagInput, setTransferTagInput] = useState('');
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  const downloadTranscript = async () => {
    setDownloadingTranscript(true);
    try {
      const res = await ticketsApi.getTranscript(guildId, ticketId);
      const blob = new Blob([res.data as BlobPart], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${data?.ticket?.number ?? ticketId}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download transcript.');
    } finally {
      setDownloadingTranscript(false);
    }
  };

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['ticket-detail', guildId, ticketId],
    queryFn: () => ticketsApi.getTicket(guildId, ticketId),
  });

  const { data: configRes } = useQuery({
    queryKey: ['tickets-config', guildId],
    queryFn: () => ticketsApi.getConfig(guildId),
  });
  const slaHours = (configRes?.data?.data as { slaHours?: number } | undefined)?.slaHours ?? 24;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket-detail', guildId, ticketId] });

  const replyMut = useMutation({
    mutationFn: () => ticketsApi.replyTicket(guildId, ticketId, { content: replyInput.trim(), authorTag: userTag }),
    onSuccess: () => {
      setReplyInput('');
      toast.success('Message sent to ticket channel.');
      // Refresh transcript after a short delay so the bot has time to append it
      setTimeout(() => invalidate(), 1500);
    },
    onError: () => toast.error('Failed to send message.'),
  });

  const reopenMut = useMutation({
    mutationFn: () => ticketsApi.reopenTicket(guildId, ticketId),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tickets-list', guildId] });
      queryClient.invalidateQueries({ queryKey: ['tickets-stats', guildId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => ticketsApi.deleteTicket(guildId, ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets-list', guildId] });
      queryClient.invalidateQueries({ queryKey: ['tickets-stats', guildId] });
      window.location.href = `/dashboard/${guildId}/tickets`;
    },
    onError: () => toast.error('Failed to delete ticket.'),
  });

  const claimMut = useMutation({
    mutationFn: (unclaim: boolean) => unclaim
      ? ticketsApi.unclaimTicket(guildId, ticketId)
      : ticketsApi.claimTicket(guildId, ticketId, { userId: user?.id ?? 'portal', userTag }),
    onSuccess: () => { invalidate(); toast.success('Ticket updated.'); },
    onError: () => toast.error('Action failed.'),
  });

  const priorityMut = useMutation({
    mutationFn: (priority: string) => ticketsApi.setPriority(guildId, ticketId, priority),
    onSuccess: () => { invalidate(); toast.success('Priority updated.'); },
    onError: () => toast.error('Failed to update priority.'),
  });

  const addTagMut = useMutation({
    mutationFn: (tag: string) => ticketsApi.addTag(guildId, ticketId, tag),
    onSuccess: () => { invalidate(); setTagInput(''); },
    onError: () => toast.error('Failed to add tag.'),
  });

  const removeTagMut = useMutation({
    mutationFn: (tag: string) => ticketsApi.removeTag(guildId, ticketId, tag),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Failed to remove tag.'),
  });

  const addNoteMut = useMutation({
    mutationFn: () => ticketsApi.addNote(guildId, ticketId, { content: noteInput.trim(), authorTag: userTag }),
    onSuccess: () => { invalidate(); setNoteInput(''); toast.success('Note added.'); },
    onError: () => toast.error('Failed to add note.'),
  });

  const transferMut = useMutation({
    mutationFn: () => ticketsApi.transferTicket(guildId, ticketId, { userId: transferInput.trim(), userTag: transferTagInput.trim() }),
    onSuccess: () => { invalidate(); setTransferInput(''); setTransferTagInput(''); toast.success('Ticket transferred.'); },
    onError: () => toast.error('Failed to transfer ticket.'),
  });

  const data = res?.data?.data as { ticket: TicketRecord; messages: TicketMessage[]; panel: TicketPanel | null } | undefined;

  if (isLoading) {
    return <div className="p-3 sm:p-6 text-center text-gray-400"><p>Loading ticket...</p></div>;
  }

  if (isError || !data) {
    return (
      <div className="p-3 sm:p-6 text-center">
        <p className="text-red-400 mb-3">Failed to load ticket.</p>
        <Link href={`/dashboard/${guildId}/tickets`} className="btn-secondary text-sm">Back to Tickets</Link>
      </div>
    );
  }

  const { ticket, messages, panel } = data;
  const priority = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium;

  // SLA warning: open longer than configured threshold with no staff response
  const slaWarning = ticket.status !== 'closed' && !ticket.firstResponseAt && slaHours > 0 &&
    (Date.now() - new Date(ticket.createdAt).getTime()) >= slaHours * 60 * 60 * 1000;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href={`/dashboard/${guildId}/tickets`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">
              {panel ? `${panel.emoji} ` : ''}Ticket #{ticket.number}
            </h1>
            <span className={`badge ${STATUS_BADGE[ticket.status] ?? 'badge-secondary'} text-xs`}>
              {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
            </span>
            {slaWarning && (
              <span className="badge-warning flex items-center gap-1 text-xs">
                <AlertTriangle className="w-3 h-3" /> SLA Warning
              </span>
            )}
          </div>
          <p className={`text-sm mt-0.5 ${priority.color}`}>{priority.label} Priority</p>
        </div>
        {ticket.status === 'closed' && panel?.closeAction !== 'delete' && (
          <button
            onClick={() => reopenMut.mutate()}
            disabled={reopenMut.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {reopenMut.isPending ? 'Reopening...' : 'Reopen Ticket'}
          </button>
        )}
        <button
          onClick={downloadTranscript}
          disabled={downloadingTranscript}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          {downloadingTranscript ? 'Exporting...' : 'Transcript'}
        </button>
        <button
          onClick={() => { if (confirm(`Permanently delete ticket #${ticket.number}? This cannot be undone.`)) deleteMut.mutate(); }}
          disabled={deleteMut.isPending}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          {deleteMut.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {/* Info Grid */}
      <div className="card grid grid-cols-2 md:grid-cols-3 gap-4">
        <InfoCell label="Opened by"  value={ticket.username} />
        <InfoCell label="Panel"      value={panel?.name ?? ticket.panelId} />
        <InfoCell label="Created"    value={new Date(ticket.createdAt).toLocaleString()} />
        <InfoCell label="Last activity" value={new Date(ticket.lastActivity).toLocaleString()} />
        {ticket.firstResponseAt && (
          <InfoCell
            label="First response"
            value={formatResponseTime(ticket.createdAt, ticket.firstResponseAt)}
          />
        )}
        {ticket.claimedByTag && <InfoCell label="Claimed by"  value={ticket.claimedByTag} />}
        {ticket.transferredToTag && <InfoCell label="Transferred to" value={ticket.transferredToTag} />}
        {ticket.closedByTag  && <InfoCell label="Closed by"   value={ticket.closedByTag} />}
        {ticket.closedAt     && <InfoCell label="Closed at"   value={new Date(ticket.closedAt).toLocaleString()} />}
        {ticket.reason && <InfoCell label="Reason"    value={ticket.reason} className="col-span-2 md:col-span-3" />}
        {ticket.tags.length > 0 && (
          <div className="col-span-2 md:col-span-3">
            <p className="text-gray-500 text-xs mb-1">Tags</p>
            <div className="flex flex-wrap gap-1">
              {ticket.tags.map((tag) => (
                <span key={tag} className="badge-secondary text-xs">{tag}</span>
              ))}
            </div>
          </div>
        )}
        {ticket.rating !== undefined && (
          <div className={ticket.ratingFeedback ? 'col-span-2 md:col-span-1' : ''}>
            <p className="text-gray-500 text-xs mb-1">Rating</p>
            <div className="flex items-center gap-1">
              {'⭐'.repeat(ticket.rating)}
              <span className="text-gray-400 text-sm ml-1">({ticket.rating}/5)</span>
            </div>
          </div>
        )}
        {ticket.ratingFeedback && (
          <InfoCell label="Rating Feedback" value={ticket.ratingFeedback} className="col-span-2 md:col-span-3" />
        )}
        {ticket.categoryTag && <InfoCell label="Category" value={ticket.categoryTag} />}
      </div>

      {/* Timeline */}
      <div className="card space-y-3">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" /> Timeline
        </h2>
        <Timeline ticket={ticket} />
      </div>

      {/* Actions (only for open/claimed tickets) */}
      {ticket.status !== 'closed' && (
        <div className="card space-y-4">
          <h2 className="text-white font-semibold border-b border-gray-700/50 pb-2">Staff Actions</h2>

          {/* Claim / Unclaim */}
          <div className="flex items-center gap-3 flex-wrap">
            <UserCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-400 text-sm w-24">Claim</span>
            {ticket.claimedByTag ? (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-gray-300 text-sm">Claimed by <span className="text-white font-medium">{ticket.claimedByTag}</span></span>
                <button onClick={() => claimMut.mutate(true)} disabled={claimMut.isPending} className="btn-secondary text-xs py-1 px-2">Unclaim</button>
              </div>
            ) : (
              <button onClick={() => claimMut.mutate(false)} disabled={claimMut.isPending} className="btn-secondary text-xs py-1 px-3">Claim as {userTag}</button>
            )}
          </div>

          {/* Transfer */}
          <div className="flex items-start gap-3 flex-wrap">
            <ArrowRightLeft className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2" />
            <span className="text-gray-400 text-sm w-24 mt-2">Transfer</span>
            <div className="flex gap-2 flex-1 flex-wrap">
              <input className="input text-sm font-mono flex-1 min-w-[140px]" placeholder="User ID" value={transferInput} onChange={(e) => setTransferInput(e.target.value)} />
              <input className="input text-sm flex-1 min-w-[140px]" placeholder="Username" value={transferTagInput} onChange={(e) => setTransferTagInput(e.target.value)} />
              <button
                onClick={() => transferMut.mutate()}
                disabled={transferMut.isPending || !transferInput.trim() || !transferTagInput.trim()}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
              >Transfer</button>
            </div>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-24 pl-7">Priority</span>
            <select
              className="input text-sm w-36"
              value={ticket.priority}
              onChange={(e) => priorityMut.mutate(e.target.value)}
              disabled={priorityMut.isPending}
            >
              {['low', 'medium', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3">
            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2" />
            <span className="text-gray-400 text-sm w-24 mt-2">Tags</span>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); addTagMut.mutate(tagInput.trim()); } }}
                />
                <button onClick={() => addTagMut.mutate(tagInput.trim())} disabled={!tagInput.trim() || addTagMut.isPending} className="btn-secondary text-xs px-3 disabled:opacity-40">Add</button>
              </div>
              {ticket.tags.filter((t) => t !== 'sla-warned').length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ticket.tags.filter((t) => t !== 'sla-warned').map((tag) => (
                    <span key={tag} className="flex items-center gap-1 bg-gray-700/50 text-gray-200 text-xs rounded px-2 py-1">
                      {tag}
                      <button onClick={() => removeTagMut.mutate(tag)} className="text-gray-500 hover:text-red-400 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Add Note */}
          <div className="flex items-start gap-3">
            <StickyNote className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2" />
            <span className="text-gray-400 text-sm w-24 mt-2">Add Note</span>
            <div className="flex-1 space-y-2">
              <textarea
                className="input text-sm w-full h-16 resize-none"
                placeholder="Private staff note (not visible to the ticket creator)..."
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                maxLength={500}
              />
              <button onClick={() => addNoteMut.mutate()} disabled={!noteInput.trim() || addNoteMut.isPending} className="btn-secondary text-xs px-3 disabled:opacity-40">Add Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Notes */}
      {ticket.notes.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-white font-semibold flex items-center gap-2">
            🔒 Staff Notes
            <span className="badge-secondary text-xs">{ticket.notes.length}</span>
          </h2>
          <div className="space-y-2">
            {ticket.notes.map((note) => (
              <div key={note.id} className="bg-gray-700/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-medium">{note.authorTag}</span>
                  <span className="text-gray-500 text-xs">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-gray-300 text-sm">{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reply to ticket channel */}
      {ticket.status !== 'closed' && (
        <div className="card space-y-3">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Send className="w-4 h-4 text-gray-400" /> Reply in Channel
          </h2>
          <div className="space-y-2">
            <textarea
              className="input text-sm w-full h-20 resize-none"
              placeholder="Type a message to send into the ticket channel..."
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyInput.trim()) {
                  e.preventDefault();
                  replyMut.mutate();
                }
              }}
              maxLength={2000}
            />
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-xs">Ctrl+Enter to send · Appears as a staff embed in Discord</p>
              <button
                onClick={() => replyMut.mutate()}
                disabled={!replyInput.trim() || replyMut.isPending}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                {replyMut.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">
            Transcript
            <span className="text-gray-500 text-sm font-normal ml-2">({messages.length} messages)</span>
          </h2>
        </div>

        {messages.length === 0 ? (
          <p className="text-gray-400 text-sm">No messages recorded. Messages are tracked once the addon is active.</p>
        ) : (
          <div className="space-y-0 max-h-[500px] overflow-y-auto">
            {messages.map((msg, i) => (
              <MessageRow key={i} msg={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-gray-200 text-sm">{value}</p>
    </div>
  );
}

function MessageRow({ msg }: { msg: TicketMessage }) {
  const time = new Date(msg.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex gap-3 py-2 border-b border-gray-700/30 last:border-0">
      <div className="w-7 h-7 rounded-full bg-discord-blurple flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
        {msg.authorTag[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-white text-sm font-medium">{msg.authorTag}</span>
          <span className="text-gray-500 text-xs">{time}</span>
        </div>
        {msg.content && (
          <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">{msg.content}</p>
        )}
        {msg.attachments.map((url, j) => {
          const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
          return isImage ? (
            <a key={j} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt="attachment" className="mt-1 max-h-32 rounded" />
            </a>
          ) : (
            <a key={j} href={url} target="_blank" rel="noreferrer" className="text-discord-blurple text-xs hover:underline block mt-1">
              📎 {url.split('/').pop()}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function formatResponseTime(createdAt: string, responseAt: string): string {
  const diffMs = new Date(responseAt).getTime() - new Date(createdAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
