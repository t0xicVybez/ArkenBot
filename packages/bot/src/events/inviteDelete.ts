
import type { Invite } from 'discord.js';
import type { BotEvent } from '../types.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

// Drops a deleted invite from the tracker's cache so stale codes don't linger.
const event: BotEvent = {
  name: 'inviteDelete',
  async execute(_client: unknown, invite: Invite) {
    if (!invite.guild) return;
    InviteTrackerModule.removeInvite(invite.guild.id, invite.code);
  },
};

export default event;
