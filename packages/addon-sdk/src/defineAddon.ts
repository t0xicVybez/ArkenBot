/**
 * Functional entry point for defining an addon.
 * Passes the definition through unchanged; the return type provides full TypeScript inference.
 *
 * Prefer this over extending `Addon` for most addons — it is more concise and
 * works well with tree-shaking.
 *
 * @example
 * ```ts
 * export default defineAddon({
 *   manifest: {
 *     name: 'my-addon',
 *     displayName: 'My Addon',
 *     version: '1.0.0',
 *     description: 'Does something cool',
 *     author: 'Your Name',
 *   },
 *   commands: [...],
 *   events: [...],
 *   hooks: {
 *     onLoad: async (ctx) => {
 *       ctx.logger.info('My addon loaded!');
 *     },
 *   },
 * });
 * ```
 */

import type { AddonDefinition } from './types.js';

/**
 * Defines an addon using the functional API.
 * Returns the definition object unchanged after validating its TypeScript shape.
 *
 * @param definition - The complete addon definition including manifest, commands, events, and hooks.
 */
export function defineAddon(definition: AddonDefinition): AddonDefinition {
  return definition;
}
