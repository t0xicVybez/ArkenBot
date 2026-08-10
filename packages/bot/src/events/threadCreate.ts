/**
 * threadCreate event — handles forum post management on new thread creation.
 *
 * Checks if the parent channel is a ForumChannel, reads config from
 * GuildSettings.extended.forumManagement, applies auto-tags and sends
 * template messages as configured.
 */
import { ChannelType, type AnyThreadChannel } from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { getGuildSettings } from '../utils/settings.js';
import { logger, swallow} from '../logger.js';

interface ForumChannelConfig {
  requireTag?: boolean;
  autoTagId?: string | null;
  templateMessage?: string | null;
}

interface ForumManagementConfig {
  channels: Record<string, ForumChannelConfig>;
}

const event: BotEvent = {
  name: 'threadCreate',
  async execute(_client: BotClient, thread: AnyThreadChannel, newlyCreated: boolean) {
    if (!newlyCreated) return;
    if (!thread.guild) return;

    const parent = thread.parent;
    if (!parent || parent.type !== ChannelType.GuildForum) return;

    try {
      const settings = await getGuildSettings(thread.guild.id);
      const extended = (settings?.extended ?? {}) as Record<string, unknown>;
      const forumConfig = extended.forumManagement as ForumManagementConfig | undefined;

      if (!forumConfig?.channels) return;

      const channelConfig = forumConfig.channels[parent.id];
      if (!channelConfig) return;

      // Apply auto-tag if configured
      if (channelConfig.autoTagId) {
        const availableTags = parent.availableTags;
        const tag = availableTags.find(t => t.id === channelConfig.autoTagId);
        if (tag) {
          const currentTagIds = thread.appliedTags ?? [];
          if (!currentTagIds.includes(tag.id)) {
            await thread.setAppliedTags([...currentTagIds, tag.id], 'Forum auto-tag').catch(swallow);
          }
        }
      }

      // Send template message if configured
      if (channelConfig.templateMessage) {
        await thread.send({ content: channelConfig.templateMessage }).catch(swallow);
      }
    } catch (err) {
      logger.error({ err, guildId: thread.guild.id, threadId: thread.id }, 'threadCreate forum management error');
    }
  },
};

export default event;
