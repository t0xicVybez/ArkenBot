
import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import type { BotEvent } from '../types.js';
import { ReactionRolesModule } from '../modules/reactionRoles/ReactionRolesModule.js';
import { StarboardModule } from '../modules/starboard/StarboardModule.js';
import { prisma } from '../database.js';

// A 👍/👎 on a suggestion message counts as a vote — bump the stored tally.
async function handleSuggestionVote(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;
  const emoji = reaction.emoji.name;
  if (emoji !== '👍' && emoji !== '👎') return;
  const suggestion = await prisma.suggestion.findFirst({ where: { messageId: reaction.message.id } });
  if (!suggestion) return;
  const field = emoji === '👍' ? 'upvotes' : 'downvotes';
  await prisma.suggestion.update({ where: { id: suggestion.id }, data: { [field]: { increment: 1 } } });
}

// A reaction was added. Could drive reaction roles, the starboard, or a
// suggestion vote. Reactions on old messages arrive "partial", so we fetch full
// data first (bailing if that fails), then dispatch to all three.
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
