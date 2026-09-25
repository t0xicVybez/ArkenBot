import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'accent' | 'info' | 'warning' | 'danger' | 'neutral';

const tones: Record<Tone, string> = {
  accent: 'bg-(--accent-soft) text-(--accent)',
  info: 'bg-(--info-soft) text-(--info)',
  warning: 'bg-(--warning-soft) text-(--warning)',
  danger: 'bg-(--danger-soft) text-(--danger)',
  neutral:
    'bg-(--bg-elevated) text-(--text-secondary) border border-(--border)',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-(--r-pill)',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
