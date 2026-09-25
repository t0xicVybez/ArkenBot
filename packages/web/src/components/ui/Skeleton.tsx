import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-(--r) bg-(--bg-hover)', className)} />;
}
