import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded-[6px] border border-(--border) bg-(--bg-base) px-1.5 py-0.5 text-[11px] text-(--text-secondary)',
        className,
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
      {...props}
    />
  );
}
