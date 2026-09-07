import type { ReactNode } from 'react';
import { cn } from './cn';

export function ChartCard({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-[18px]',
        className,
      )}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <h3 className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  );
}
