import type { LucideIcon } from 'lucide-react';

/**
 * The one page-header pattern used across the dashboard:
 * icon tile · title · one-line purpose · actions on the right.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-icon">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <div className="page-head-desc">{description}</div>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}
