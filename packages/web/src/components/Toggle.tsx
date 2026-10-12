'use client';

import { clsx } from 'clsx';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, label, description, disabled }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      {(label || description) && (
        <div className="flex-1 mr-4">
          {label && <p className="text-sm font-medium text-gray-200">{label}</p>}
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => !disabled && onChange(!enabled)}
        className={clsx(
          'toggle',
          enabled ? 'bg-discord-blurple' : 'bg-gray-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={clsx('toggle-thumb', enabled ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
}
