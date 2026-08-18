import type { Ticket, TicketPanel, TicketMessage } from '../types.js';
import type { Translate } from './embeds.js';

const PRIORITY_COLOR: Record<string, string> = {
  low: '#57f287',
  medium: '#fee75c',
  high: '#f0a500',
  urgent: '#ed4245',
};

/**
 * Generate an HTML transcript for a ticket.
 * Returns a Buffer ready to be uploaded as a Discord file attachment.
 */
export function generateTranscriptHtml(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  t: Translate,
  includeNotes = true,
): Buffer {
  const rows = messages
    .map((m) => {
      const time = new Date(m.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const attachmentLinks = m.attachments
        .map((url) => {
          const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
          return isImage
            ? `<a href="${escHtml(url)}" target="_blank"><img src="${escHtml(url)}" style="max-height:120px;border-radius:4px;margin-top:4px;display:block" /></a>`
            : `<a href="${escHtml(url)}" target="_blank">${escHtml(url)}</a>`;
        })
        .join('\n');

      return `
        <div class="msg">
          <div class="meta">
            <span class="author">${escHtml(m.authorTag)}</span>
            <span class="time">${time}</span>
          </div>
          <div class="content">${escHtml(m.content).replace(/\n/g, '<br>')}</div>
          ${attachmentLinks ? `<div class="attachments">${attachmentLinks}</div>` : ''}
        </div>`;
    })
    .join('\n');

  const priorityColor = PRIORITY_COLOR[ticket.priority] ?? '#99aab5';
  const notesHtml = includeNotes
    ? ticket.notes
        .map(
          (n) =>
            `<div class="note"><span class="note-author">${escHtml(n.authorTag)}</span> <span class="note-time">${new Date(n.createdAt).toLocaleString()}</span><p>${escHtml(n.content)}</p></div>`,
        )
        .join('\n')
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ticket #${ticket.number} Transcript</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#36393f;color:#dcddde;min-height:100vh}
    .header{background:#2f3136;padding:20px 32px;border-bottom:1px solid #202225;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
    .title{font-size:1.4rem;font-weight:700;color:#fff}
    .badge{padding:3px 10px;border-radius:12px;font-size:.75rem;font-weight:600}
    .badge-priority{background:${priorityColor}20;color:${priorityColor};border:1px solid ${priorityColor}40}
    .info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:20px 32px;background:#2f3136;border-bottom:1px solid #202225}
    .info-cell label{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#72767d;display:block;margin-bottom:2px}
    .info-cell span{font-size:.9rem;color:#dcddde}
    .messages{padding:20px 32px;max-width:900px;margin:0 auto}
    .msg{padding:8px 0;border-bottom:1px solid #40444b}
    .msg:last-child{border-bottom:none}
    .meta{display:flex;align-items:baseline;gap:10px;margin-bottom:3px}
    .author{font-weight:600;color:#fff;font-size:.95rem}
    .time{font-size:.75rem;color:#72767d}
    .content{font-size:.9rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}
    .attachments{margin-top:6px}
    .attachments a{color:#00aff4;font-size:.85rem}
    .notes-section{padding:20px 32px;max-width:900px;margin:0 auto}
    .notes-title{font-size:1rem;font-weight:600;color:#fff;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #40444b}
    .note{background:#2f3136;border:1px solid #40444b;border-radius:6px;padding:10px 14px;margin-bottom:8px}
    .note-author{font-weight:600;color:#fff;font-size:.85rem}
    .note-time{font-size:.75rem;color:#72767d;margin-left:6px}
    .note p{font-size:.85rem;margin-top:4px;color:#b9bbbe}
    footer{text-align:center;padding:20px;color:#72767d;font-size:.75rem;border-top:1px solid #202225;margin-top:20px}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${t('ticketTitle', { num: ticket.number })} — ${escHtml(panel.name)}</div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge badge-priority">${t('priority' + ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)).toUpperCase()}</span>
        ${ticket.rating ? `<span class="badge" style="background:#fee75c20;color:#fee75c;border:1px solid #fee75c40">${'⭐'.repeat(ticket.rating)}</span>` : ''}
      </div>
    </div>
    <div style="font-size:.8rem;color:#72767d">${t('htmlGenerated', { date: new Date().toUTCString() })}</div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><label>${t('fieldOpenedBy')}</label><span>${escHtml(ticket.username)}</span></div>
    <div class="info-cell"><label>${t('fieldStatus')}</label><span>${t('status' + ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1))}</span></div>
    <div class="info-cell"><label>${t('fieldPanel')}</label><span>${escHtml(panel.name)}</span></div>
    <div class="info-cell"><label>${t('htmlOpenedAt')}</label><span>${new Date(ticket.createdAt).toLocaleString()}</span></div>
    ${ticket.closedAt ? `<div class="info-cell"><label>${t('htmlClosedAt')}</label><span>${new Date(ticket.closedAt).toLocaleString()}</span></div>` : ''}
    ${ticket.claimedByTag ? `<div class="info-cell"><label>${t('fieldClaimedBy')}</label><span>${escHtml(ticket.claimedByTag)}</span></div>` : ''}
    ${ticket.reason ? `<div class="info-cell"><label>${t('fieldReason')}</label><span>${escHtml(ticket.reason)}</span></div>` : ''}
    ${ticket.tags.length > 0 ? `<div class="info-cell"><label>${t('fieldTags')}</label><span>${ticket.tags.map(escHtml).join(', ')}</span></div>` : ''}
    ${ticket.rating ? `<div class="info-cell"><label>${t('fieldRating')}</label><span>${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)</span></div>` : ''}
    ${ticket.ratingFeedback ? `<div class="info-cell" style="grid-column:span 2"><label>${t('htmlRatingFeedback')}</label><span>${escHtml(ticket.ratingFeedback)}</span></div>` : ''}
    <div class="info-cell"><label>${t('fieldMessages')}</label><span>${messages.length}</span></div>
  </div>

  <div class="messages">
    <div style="font-size:.8rem;color:#72767d;margin-bottom:12px">${t('htmlMessagesCount', { n: messages.length })}</div>
    ${rows}
  </div>

  ${includeNotes && ticket.notes.length > 0 ? `
  <div class="notes-section">
    <div class="notes-title">🔒 ${t('fieldStaffNotes')}</div>
    ${notesHtml}
  </div>` : ''}

  <footer>${t('htmlGeneratedBy', { date: new Date().toUTCString() })}</footer>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateTranscriptText(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  includeNotes: boolean,
): Buffer {
  const lines: string[] = [
    `=== TICKET #${ticket.number} TRANSCRIPT ===`,
    `Panel: ${panel.name}`,
    `Opened by: ${ticket.username} (${ticket.userId})`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    `Created: ${new Date(ticket.createdAt).toLocaleString()}`,
    ticket.closedAt ? `Closed: ${new Date(ticket.closedAt).toLocaleString()}` : '',
    ticket.reason ? `Reason: ${ticket.reason}` : '',
    ticket.rating ? `Rating: ${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)` : '',
    ticket.ratingFeedback ? `Feedback: ${ticket.ratingFeedback}` : '',
    '',
    '=== MESSAGES ===',
    '',
    ...messages.map((m) => `[${new Date(m.timestamp).toLocaleString()}] ${m.authorTag}: ${m.content}${m.attachments.length ? ` [${m.attachments.length} attachment(s)]` : ''}`),
  ];

  if (includeNotes && ticket.notes.length > 0) {
    lines.push('', '=== STAFF NOTES ===', '');
    for (const note of ticket.notes) {
      lines.push(`[${new Date(note.createdAt).toLocaleString()}] ${note.authorTag}: ${note.content}`);
    }
  }

  return Buffer.from(lines.filter((l) => l !== undefined).join('\n'), 'utf-8');
}

export function generateTranscriptJson(
  ticket: Ticket,
  panel: TicketPanel,
  messages: TicketMessage[],
  includeNotes: boolean,
): Buffer {
  const data = {
    ticket: {
      id: ticket.id,
      number: ticket.number,
      panel: panel.name,
      userId: ticket.userId,
      username: ticket.username,
      status: ticket.status,
      priority: ticket.priority,
      reason: ticket.reason,
      categoryTag: ticket.categoryTag,
      tags: ticket.tags,
      rating: ticket.rating,
      ratingFeedback: ticket.ratingFeedback,
      createdAt: ticket.createdAt,
      closedAt: ticket.closedAt,
      closedBy: ticket.closedByTag,
      firstResponseAt: ticket.firstResponseAt,
      formResponses: ticket.formResponses,
    },
    messages: messages.map((m) => ({
      author: m.authorTag,
      authorId: m.authorId,
      content: m.content,
      attachments: m.attachments,
      timestamp: m.timestamp,
    })),
    notes: includeNotes ? ticket.notes : [],
  };
  return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
}
