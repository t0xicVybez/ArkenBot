import type { ReactNode } from 'react';
import { cn } from './cn';

export function StatTile({
  label,
  value,
  trend,
  trendTone = 'up',
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  trend?: string;
  trendTone?: 'up' | 'down' | 'flat';
  icon?: ReactNode;
  className?: string;
}) {
  const tone =
    trendTone === 'down'
      ? 'text-(--danger)'
      : trendTone === 'flat'
        ? 'text-(--text-secondary)'
        : 'text-(--accent)';
  return (
    <div
      className={cn(
        'bg-(--bg-card) border border-(--border) rounded-(--r-lg) p-4',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-(--text-secondary)">
        {icon}
        {label}
      </div>
      <div className="mt-2.5 text-[28px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {trend && <div className={cn('mt-1.5 text-[12px] font-semibold', tone)}>{trend}</div>}
    </div>
  );
}
