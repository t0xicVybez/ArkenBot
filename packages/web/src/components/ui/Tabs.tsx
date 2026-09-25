'use client';
import { cn } from './cn';

export function Tabs<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T;
  onValueChange?: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex gap-1 p-1 rounded-(--r) bg-(--bg-elevated) border border-(--border)',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onValueChange?.(o.value)}
          className={cn(
            'px-3 py-1.5 text-[13px] font-medium rounded-(--r-sm) transition-colors',
            value === o.value
              ? 'bg-(--accent-soft) text-(--accent)'
              : 'text-(--text-secondary) hover:text-(--text-primary)',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
