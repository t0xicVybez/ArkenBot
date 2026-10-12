
import type { Presence } from 'discord.js';
import type { BotEvent } from '../types.js';
import { ValorantModule } from '../modules/valorant/ValorantModule.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';
import { swallow } from '../logger.js';

const event: BotEvent = {
  name: 'presenceUpdate',
  async execute(_client: unknown, oldPresence: Presence | null, newPresence: Presence) {
    await ValorantModule.handlePresence(oldPresence, newPresence).catch(swallow);
    await PromotionModule.handlePresence(oldPresence, newPresence).catch(swallow);
  },
};

export default event;
