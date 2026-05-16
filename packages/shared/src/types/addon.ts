/** Types describing addon manifests, settings schemas, and guild-addon relationships. */

/**
 * Static metadata declared by every addon. This is read by the bot core
 * to register commands, validate settings, and display addon information in the portal.
 */
export interface AddonManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  commands?: string[];
  events?: string[];
  settings?: AddonSettingSchema[];
  portalPages?: AddonPortalPage[];
  permissions?: string[];
  dependencies?: Record<string, string>;
}

/**
 * Describes a single configurable setting exposed by an addon.
 * The portal renders each schema entry as an appropriate input control.
 */
export interface AddonSettingSchema {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'channel' | 'role' | 'color' | 'select';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  /** Valid choices for `type: 'select'` fields. */
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

/** A custom page registered by an addon in the web portal. */
export interface AddonPortalPage {
  path: string;
  label: string;
  icon?: string;
  /** Name of the frontend component to render for this page. */
  component: string;
}

/** Full addon record as stored in the database. */
export interface AddonInfo {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  enabled: boolean;
  verified: boolean;
  manifest: AddonManifest;
  createdAt: Date;
  updatedAt: Date;
}

/** Association between a guild and an installed addon, including per-guild settings. */
export interface GuildAddon {
  id: string;
  guildId: string;
  addonId: string;
  addon: AddonInfo;
  enabled: boolean;
  settings: Record<string, unknown>;
}
