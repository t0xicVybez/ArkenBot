

import type { AddonDefinition } from './types.js';

export abstract class Addon {
  abstract readonly definition: AddonDefinition;
}
