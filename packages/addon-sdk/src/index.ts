/** Public API surface for the ArkenBot addon SDK. Import from this module in your addon. */
export { Addon } from './Addon.js';
export { AddonContext } from './AddonContext.js';
export { AddonEventBus } from './AddonEventBus.js';
export { defineAddon } from './defineAddon.js';
export type {
  AddonDefinition,
  AddonLifecycleHooks,
  AddonCommandDefinition,
  AddonEventHandler,
  AddonStorage,
  AddonLogger,
} from './types.js';
export type { AddonManifest, AddonSettingSchema } from '@arkenbot/shared';
