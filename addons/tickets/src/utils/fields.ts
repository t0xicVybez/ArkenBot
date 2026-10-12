/**
 * fields helpers for the tickets addon.
 */
import type { TicketPanel, PanelField } from '../types.js';

export function resolvePanelFields(panel: TicketPanel, buttonId?: string): PanelField[] {
  const button = buttonId ? panel.buttons?.find((b) => b.id === buttonId) : undefined;
  if (button?.fields && button.fields.length > 0) return button.fields;
  return panel.fields ?? [];
}
