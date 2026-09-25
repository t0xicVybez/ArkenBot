import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-(--bg-elevated) border border-(--border) rounded-(--r) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) outline-hidden transition-shadow focus:border-(--accent) focus:ring-2 focus:ring-(--accent-glow)',
          className,
        )}
        {...props}
      />
    );
  },
);
