

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

export interface AddonSettingSchema {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'channel' | 'role' | 'color' | 'select';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;

  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface AddonPortalPage {
  path: string;
  label: string;
  icon?: string;

  component: string;
}

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

export interface GuildAddon {
  id: string;
  guildId: string;
  addonId: string;
  addon: AddonInfo;
  enabled: boolean;
  settings: Record<string, unknown>;
}
