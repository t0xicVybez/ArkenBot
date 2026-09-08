'use client';

import { Button } from '../ui/Button';

export function SaveBar({
  dirty,
  count = 3,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  count?: number;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="absolute inset-x-6 bottom-5 z-40 flex items-center gap-4 rounded-[14px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--sh-pop)]">
      <span
        className="h-2 w-2 flex-none rounded-full bg-[var(--warning)]"
        style={{ boxShadow: '0 0 8px var(--warning)' }}
      />
      <div className="text-[13.5px] font-semibold">
        Unsaved changes{' '}
        <span className="font-normal text-[var(--text-secondary)]">· {count} settings modified</span>
      </div>
      <div className="flex-1" />
      <Button variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}
