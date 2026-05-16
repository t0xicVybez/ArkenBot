/**
 * inviteDelete event — removes a deleted guild invite from the invite tracker
 * cache to prevent stale attribution on future joins.
 */
import type { Invite } from 'discord.js';
import type { BotEvent } from '../types.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

const event: BotEvent = {
  name: 'inviteDelete',
  async execute(_client: unknown, invite: Invite) {
    if (!invite.guild) return;
    InviteTrackerModule.removeInvite(invite.guild.id, invite.code);
  },
};

export default event;
