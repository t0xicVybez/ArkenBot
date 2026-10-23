/**
 * Minimal renderer for the subset of markdown Discord actually supports in
 * messages/embeds (not full CommonMark — no headers, images, tables, etc.).
 * Used to make staff-facing previews (announcements, embed builder) match
 * what will really show up in Discord.
 */

import type { ReactNode } from 'react';

interface InlineRule {
  regex: RegExp;
  render: (match: RegExpExecArray, key: string) => ReactNode;
}

const INLINE_RULES: InlineRule[] = [
  {
    regex: /\[([^\]]+)\]\((\S+?)\)/,
    render: (m, key) => (
      <a key={key} href={m[2]} target="_blank" rel="noreferrer" className="text-[#00a8fc] hover:underline">
        {parseInline(m[1], `${key}-l`)}
      </a>
    ),
  },
  {
    regex: /\*\*\*([^*]+)\*\*\*/,
    render: (m, key) => (
      <strong key={key} className="font-bold italic">
        {parseInline(m[1], `${key}-bi`)}
      </strong>
    ),
  },
  {
    regex: /\*\*([^*]+)\*\*/,
    render: (m, key) => <strong key={key} className="font-bold">{parseInline(m[1], `${key}-b`)}</strong>,
  },
  {
    regex: /__([^_]+)__/,
    render: (m, key) => <span key={key} className="underline">{parseInline(m[1], `${key}-u`)}</span>,
  },
  {
    regex: /~~([^~]+)~~/,
    render: (m, key) => <span key={key} className="line-through">{parseInline(m[1], `${key}-s`)}</span>,
  },
  {
    regex: /`([^`]+)`/,
    render: (m, key) => (
      <code key={key} className="bg-black/30 rounded px-1 py-0.5 text-[0.85em] font-mono">
        {m[1]}
      </code>
    ),
  },
  {
    regex: /\*([^*]+)\*/,
    render: (m, key) => <em key={key} className="italic">{parseInline(m[1], `${key}-i1`)}</em>,
  },
  {
    regex: /(?<![\w])_([^_]+)_(?![\w])/,
    render: (m, key) => <em key={key} className="italic">{parseInline(m[1], `${key}-i2`)}</em>,
  },
];

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  let earliestIndex = -1;
  let earliestRule: InlineRule | null = null;
  let earliestMatch: RegExpExecArray | null = null;

  for (const rule of INLINE_RULES) {
    const re = new RegExp(rule.regex, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + '');
    const m = re.exec(text);
    if (m && (earliestIndex === -1 || m.index < earliestIndex)) {
      earliestIndex = m.index;
      earliestRule = rule;
      earliestMatch = m;
    }
  }

  if (!earliestRule || !earliestMatch) return [text];

  const before = text.slice(0, earliestMatch.index);
  const after = text.slice(earliestMatch.index + earliestMatch[0].length);
  const nodes: ReactNode[] = [];
  if (before) nodes.push(before);
  nodes.push(earliestRule.render(earliestMatch, `${keyPrefix}-${earliestIndex}`));
  if (after) nodes.push(...parseInline(after, `${keyPrefix}-after`));
  return nodes;
}

export function renderDiscordMarkdown(text: string): ReactNode {
  if (!text) return null;

  // Code blocks (```...```) are extracted whole first — nothing inside them
  // is processed as markdown, matching Discord's own behavior.
  const blocks = text.split(/(```[\s\S]*?```)/g);

  return blocks.map((block, blockIdx) => {
    if (block.startsWith('```') && block.endsWith('```')) {
      const inner = block.slice(3, -3).replace(/^\w*\n/, '');
      return (
        <pre key={`code-${blockIdx}`} className="bg-black/30 rounded-md p-2 text-[0.85em] font-mono overflow-x-auto my-1 whitespace-pre-wrap">
          {inner}
        </pre>
      );
    }

    const lines = block.split('\n');
    return lines.map((line, lineIdx) => {
      const key = `b${blockIdx}-l${lineIdx}`;
      const isQuote = line.startsWith('> ');
      const content = parseInline(isQuote ? line.slice(2) : line, key);
      const rendered = isQuote ? (
        <div className="border-l-2 border-gray-500 pl-2 text-gray-400">{content}</div>
      ) : (
        <>{content}</>
      );
      const isLastLineOfBlock = lineIdx === lines.length - 1;
      const isLastBlock = blockIdx === blocks.length - 1;
      return (
        <span key={key}>
          {rendered}
          {!(isLastLineOfBlock && isLastBlock) && <br />}
        </span>
      );
    });
  });
}
