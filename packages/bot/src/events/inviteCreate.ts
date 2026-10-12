
import type { Invite } from 'discord.js';
import type { BotEvent } from '../types.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

// Keeps the invite tracker's cached use-counts current: when a new invite is
// created, seed the cache so we can later tell which invite a joiner used.
const event: BotEvent = {
  name: 'inviteCreate',
  async execute(_client: unknown, invite: Invite) {
    if (!invite.guild) return;
    InviteTrackerModule.setInvite(invite.guild.id, invite.code, invite.uses ?? 0);
  },
};

export default event;
