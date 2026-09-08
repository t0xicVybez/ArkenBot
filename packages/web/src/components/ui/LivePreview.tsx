import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';

export function LivePreview({
  title = 'Live preview',
  hint = 'updates as you type',
  children,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-[18px]">
      <div className="mb-3.5 flex items-center gap-2 text-[12px] font-semibold text-[var(--text-secondary)]">
        <Eye className="h-[15px] w-[15px]" />
        {title}
        <span className="ml-auto flex items-center gap-1.5 text-[var(--accent)]">
          <span className="h-[6px] w-[6px] rounded-full bg-[var(--accent)]" />
          {hint}
        </span>
      </div>
      {children}
    </div>
  );
}
