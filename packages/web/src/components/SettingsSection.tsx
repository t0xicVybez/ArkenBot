/**
 * Layout wrapper for a dashboard settings group: renders a titled card with
 * an optional description and stacked children, using the shared card anatomy
 * (bordered header row, padded body).
 */
interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}

export function SettingsSection({ title, description, children, danger = false }: SettingsSectionProps) {
  return (
    <div className={`card p-0 overflow-hidden mb-6 ${danger ? 'border-[rgba(242,109,95,0.28)]' : ''}`}>
      <div className={`px-[18px] py-[13px] border-b ${danger ? 'border-[rgba(242,109,95,0.18)]' : 'border-[var(--border-subtle)]'}`}>
        <h3 className={`text-[13.5px] font-bold ${danger ? 'text-[var(--danger)]' : 'text-white'}`}>{title}</h3>
        {description && <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      <div className="p-[18px] space-y-4">{children}</div>
    </div>
  );
}
