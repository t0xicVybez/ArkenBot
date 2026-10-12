
import type { Invite } from 'discord.js';
import type { BotEvent } from '../types.js';
import { InviteTrackerModule } from '../modules/inviteTracker/InviteTrackerModule.js';

const event: BotEvent = {
  name: 'inviteCreate',
  async execute(_client: unknown, invite: Invite) {
    if (!invite.guild) return;
    InviteTrackerModule.setInvite(invite.guild.id, invite.code, invite.uses ?? 0);
  },
};

export default event;
