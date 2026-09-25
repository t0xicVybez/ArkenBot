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
    <div className="rounded-(--r-lg) border border-(--border) bg-(--bg-card) p-[18px]">
      <div className="mb-3.5 flex items-center gap-2 text-[12px] font-semibold text-(--text-secondary)">
        <Eye className="h-[15px] w-[15px]" />
        {title}
        <span className="ml-auto flex items-center gap-1.5 text-(--accent)">
          <span className="h-[6px] w-[6px] rounded-full bg-(--accent)" />
          {hint}
        </span>
      </div>
      {children}
    </div>
  );
}
