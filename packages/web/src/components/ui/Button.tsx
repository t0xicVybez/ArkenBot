import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-(--accent) text-(--accent-contrast) hover:bg-(--accent-hover) shadow-(--sh-glow)',
  secondary:
    'bg-(--bg-elevated) text-(--text-primary) border border-(--border) hover:bg-(--bg-hover)',
  ghost:
    'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
  danger:
    'border border-(--danger) text-(--danger) hover:bg-(--danger-soft)',
};

const sizes: Record<Size, string> = {
  sm: 'text-[13px] px-3 py-1.5 rounded-(--r-sm)',
  md: 'text-sm px-4 py-2 rounded-(--r)',
  lg: 'text-[15px] px-5 py-2.5 rounded-(--r-md)',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--accent-glow) disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
