/**
 * presenceUpdate — drives the optional "Playing VALORANT" role. The handler
 * bails immediately (no DB hit) unless the integration is configured AND the
 * guild has a presence role enabled, so this very hot event stays cheap.
 */
import type { Presence } from 'discord.js';
import type { BotEvent } from '../types.js';
import { ValorantModule } from '../modules/valorant/ValorantModule.js';
import { swallow } from '../logger.js';

const event: BotEvent = {
  name: 'presenceUpdate',
  async execute(_client: unknown, oldPresence: Presence | null, newPresence: Presence) {
    await ValorantModule.handlePresence(oldPresence, newPresence).catch(swallow);
  },
};

export default event;
