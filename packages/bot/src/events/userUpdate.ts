
import type { User, PartialUser } from 'discord.js';
import type { BotEvent } from '../types.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';
import { swallow } from '../logger.js';

// Lets the promotion tracker react when a user changes their profile (for
// example, adding the server's vanity link to their name/status).
const event: BotEvent = {
  name: 'userUpdate',
  async execute(_client: unknown, oldUser: User | PartialUser, newUser: User) {
    await PromotionModule.handleUserUpdate(oldUser.partial ? null : oldUser, newUser).catch(swallow);
  },
};

export default event;
