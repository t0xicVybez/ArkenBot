import { cn } from './cn';

export function Avatar({
  initials,
  src,
  size = 32,
  className,
}: {
  initials?: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden text-[var(--accent-contrast)] font-semibold select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: src ? undefined : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" width={size} height={size} style={{ objectFit: 'cover' }} /> : initials}
    </span>
  );
}
