'use client';
import { CheckCircle2 } from 'lucide-react';

export function Toast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 rounded-[12px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-[13.5px] font-medium shadow-[var(--sh-pop)]">
      <CheckCircle2 className="h-[18px] w-[18px] text-[var(--accent)]" />
      {message}
    </div>
  );
}
