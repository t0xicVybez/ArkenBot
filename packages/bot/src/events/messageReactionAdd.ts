/**
 * messageReactionAdd event — resolves partial reaction/message/user objects
 * before dispatching to the reaction roles, starboard, and suggestion vote modules.
 *
 * Partials must be fetched because Discord only sends partial data for reactions
 * on messages that were not cached at startup.
 */
import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import type { BotEvent } from '../types.js';
import { ReactionRolesModule } from '../modules/reactionRoles/ReactionRolesModule.js';
import { StarboardModule } from '../modules/starboard/StarboardModule.js';
import { prisma } from '../database.js';

/**
 * Increments the upvote or downvote count on a suggestion when a non-bot user
 * reacts with 👍 or 👎 on its posted message.
 */
async function handleSuggestionVote(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;
  const emoji = reaction.emoji.name;
  if (emoji !== '👍' && emoji !== '👎') return;
  const suggestion = await prisma.suggestion.findFirst({ where: { messageId: reaction.message.id } });
  if (!suggestion) return;
  const field = emoji === '👍' ? 'upvotes' : 'downvotes';
  await prisma.suggestion.update({ where: { id: suggestion.id }, data: { [field]: { increment: 1 } } });
}

const event: BotEvent = {
  name: 'messageReactionAdd',
  async execute(_client: unknown, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }
    if (user.partial) {
      try {
        await user.fetch();
      } catch {
        return;
      }
    }

    await Promise.allSettled([
      ReactionRolesModule.handleReactionAdd(reaction as MessageReaction, user as User),
      StarboardModule.handleReaction(reaction as MessageReaction, user as User),
      handleSuggestionVote(reaction as MessageReaction, user as User),
    ]);
  },
};

export default event;
