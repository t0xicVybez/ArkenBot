import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--r)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-shadow focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
          className,
        )}
        {...props}
      />
    );
  },
);
