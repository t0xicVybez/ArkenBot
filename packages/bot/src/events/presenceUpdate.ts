
import type { Presence } from 'discord.js';
import type { BotEvent } from '../types.js';
import { ValorantModule } from '../modules/valorant/ValorantModule.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';
import { swallow } from '../logger.js';

// Feeds presence changes (status, activities) to the Valorant tracker and the
// promotion tracker, which watch for game activity and "promoting us" statuses.
const event: BotEvent = {
  name: 'presenceUpdate',
  async execute(_client: unknown, oldPresence: Presence | null, newPresence: Presence) {
    await ValorantModule.handlePresence(oldPresence, newPresence).catch(swallow);
    await PromotionModule.handlePresence(oldPresence, newPresence).catch(swallow);
  },
};

export default event;
