/**
 * userUpdate — drives server-tag promotion tracking. The handler bails cheaply
 * unless the user's displayed server tag (`primaryGuild`) actually changed.
 */
import type { User, PartialUser } from 'discord.js';
import type { BotEvent } from '../types.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';
import { swallow } from '../logger.js';

const event: BotEvent = {
  name: 'userUpdate',
  async execute(_client: unknown, oldUser: User | PartialUser, newUser: User) {
    await PromotionModule.handleUserUpdate(oldUser.partial ? null : oldUser, newUser).catch(swallow);
  },
};

export default event;
