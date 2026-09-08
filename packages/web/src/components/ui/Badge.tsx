import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'accent' | 'info' | 'warning' | 'danger' | 'neutral';

const tones: Record<Tone, string> = {
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  info: 'bg-[var(--info-soft)] text-[var(--info)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  neutral:
    'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-[var(--r-pill)]',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
