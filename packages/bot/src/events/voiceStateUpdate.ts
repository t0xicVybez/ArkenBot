

import { ChannelType, PermissionFlagsBits, type VoiceState } from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { prisma } from '../database.js';
import { logger, swallow} from '../logger.js';

/**
 * Powers "temp voice channels". Two things happen here:
 *  1. Joining a designated trigger channel creates a fresh personal voice
 *     channel owned by that member and moves them into it.
 *  2. Leaving a temp channel that's now empty deletes it, so they clean
 *     themselves up.
 */
const event: BotEvent = {
  name: 'voiceStateUpdate',
  async execute(_client: BotClient, oldState: VoiceState, newState: VoiceState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    // (1) Joined a trigger channel → spin up a personal temp VC.
    if (newState.channelId && newState.channelId !== oldState.channelId && newState.member) {
      const trigger = await prisma.tempVoiceTrigger.findUnique({
        where: { guildId_channelId: { guildId: guild.id, channelId: newState.channelId } },
      }).catch(swallow);

      if (trigger) {
        const member = newState.member;
        try {
          const category =
            trigger.categoryId ??
            guild.channels.cache.get(trigger.channelId)?.parentId ??
            null;

          const tempChannel = await guild.channels.create({
            name: `${member.displayName}'s Channel`,
            type: ChannelType.GuildVoice,
            parent: category ?? undefined,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
              },
              {
                id: member.id,
                allow: [
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.ManageChannels,
                  PermissionFlagsBits.MoveMembers,
                ],
              },
            ],
            reason: `Temp VC created for ${member.user.tag}`,
          });

          await prisma.tempVoiceChannel.create({
            data: { guildId: guild.id, channelId: tempChannel.id, ownerId: member.id },
          });

          await member.voice.setChannel(tempChannel, 'Moved to temp VC').catch(swallow);
          logger.info({ guildId: guild.id, channelId: tempChannel.id, ownerId: member.id }, 'Temp voice channel created');
        } catch (err) {
          logger.error({ err, guildId: guild.id }, 'Failed to create temp voice channel');
        }
      }
    }

    // (2) Left a channel → if it was an (now-empty) temp VC, delete it.
    const leftChannelId = oldState.channelId;
    if (leftChannelId && leftChannelId !== newState.channelId) {
      const record = await prisma.tempVoiceChannel.findUnique({
        where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
      }).catch(swallow);

      if (record) {
        const voiceChannel = guild.channels.cache.get(leftChannelId);
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
          await prisma.tempVoiceChannel.delete({
            where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
          }).catch(swallow);
          return;
        }

        const memberCount = voiceChannel.members?.size ?? 0;
        if (memberCount === 0) {
          try {
            await voiceChannel.delete('Temp VC empty — auto-deleted');
            await prisma.tempVoiceChannel.delete({
              where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
            }).catch(swallow);
            logger.info({ guildId: guild.id, channelId: leftChannelId }, 'Temp voice channel deleted (empty)');
          } catch (err) {
            logger.error({ err, guildId: guild.id }, 'Failed to delete temp voice channel');
          }
        }
      }
    }
  },
};

export default event;
