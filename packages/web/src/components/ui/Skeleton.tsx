import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[var(--r)] bg-[var(--bg-hover)]', className)} />;
}
