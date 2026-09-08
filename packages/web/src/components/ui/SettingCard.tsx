import type { ReactNode } from 'react';
import { cn } from './cn';

export function SettingCard({
  icon,
  title,
  description,
  control,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--r-lg)] p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-none w-9 h-9 rounded-[var(--r)] bg-[var(--bg-elevated)] grid place-items-center text-[var(--accent)]">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-secondary)]">
              {description}
            </p>
          )}
        </div>
        {control && <div className="flex-none">{control}</div>}
      </div>
      {children && (
        <div className="mt-3.5 pt-3.5 border-t border-[var(--border)]">{children}</div>
      )}
    </div>
  );
}
