import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-(--bg-card) border border-(--border) rounded-(--r-lg) p-(--sp-5)',
        className,
      )}
      {...props}
    />
  );
}
