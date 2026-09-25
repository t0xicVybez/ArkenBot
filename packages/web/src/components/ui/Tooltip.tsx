import type { ReactNode } from 'react';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] whitespace-nowrap rounded-(--r-sm) bg-(--bg-elevated) border border-(--border) px-2.5 py-1 text-[12px] text-(--text-primary) opacity-0 shadow-(--sh-2) transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
