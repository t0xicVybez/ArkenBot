import type { TicketPanel, PanelField } from '../types.js';

/**
 * The form questions for a ticket: a clicked button's own fields when it has
 * any, otherwise the panel-level fields. Pure — no Discord/DB deps.
 */
export function resolvePanelFields(panel: TicketPanel, buttonId?: string): PanelField[] {
  const button = buttonId ? panel.buttons?.find((b) => b.id === buttonId) : undefined;
  if (button?.fields && button.fields.length > 0) return button.fields;
  return panel.fields ?? [];
}
