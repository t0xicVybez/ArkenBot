/**
 * Abstract base class for class-based addons.
 * Extend this class and implement the `definition` property,
 * or use `defineAddon()` for a simpler functional approach.
 */

import type { AddonDefinition } from './types.js';

export abstract class Addon {
  abstract readonly definition: AddonDefinition;
}
