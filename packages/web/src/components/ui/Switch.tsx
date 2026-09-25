'use client';
import { cn } from './cn';

export function Switch({
  checked = false,
  onChange,
  disabled,
  className,
}: {
  checked?: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors duration-150 disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--accent-glow)',
        checked ? 'bg-(--accent)' : 'bg-(--bg-hover)',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] rounded-full transition-transform duration-150',
          checked
            ? 'translate-x-[22px] bg-(--accent-contrast)'
            : 'translate-x-[3px] bg-(--text-secondary)',
        )}
      />
    </button>
  );
}
