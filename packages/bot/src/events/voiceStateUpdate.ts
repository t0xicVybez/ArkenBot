/**
 * voiceStateUpdate event — manages "Create-to-Join" temporary voice channels.
 *
 * When a member joins the designated trigger channel (configured in
 * GuildSettings.extended.joinToCreateChannelId) the bot creates a new private
 * voice channel named after the member, moves them in, and records it.
 * When that temporary channel becomes empty the bot deletes it.
 */

import { ChannelType, PermissionFlagsBits, type VoiceState } from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { prisma } from '../database.js';
import { getGuildSettings } from '../utils/settings.js';
import { logger } from '../logger.js';

const event: BotEvent = {
  name: 'voiceStateUpdate',
  async execute(_client: BotClient, oldState: VoiceState, newState: VoiceState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const settings = await getGuildSettings(guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    const triggerChannelId = extended.joinToCreateChannelId as string | undefined;

    // ── Member joined the trigger channel ──────────────────────────────────────
    if (triggerChannelId && newState.channelId === triggerChannelId && newState.member) {
      const member = newState.member;
      try {
        const category = guild.channels.cache.get(triggerChannelId)?.parentId ?? null;

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

        await member.voice.setChannel(tempChannel, 'Moved to temp VC').catch(() => null);
        logger.info({ guildId: guild.id, channelId: tempChannel.id, ownerId: member.id }, 'Temp voice channel created');
      } catch (err) {
        logger.error({ err, guildId: guild.id }, 'Failed to create temp voice channel');
      }
    }

    // ── Member left a channel — check if it's an empty temp channel ───────────
    const leftChannelId = oldState.channelId;
    if (leftChannelId && leftChannelId !== newState.channelId) {
      const record = await prisma.tempVoiceChannel.findUnique({
        where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
      }).catch(() => null);

      if (record) {
        const voiceChannel = guild.channels.cache.get(leftChannelId);
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
          // Channel already gone — clean up the DB record
          await prisma.tempVoiceChannel.delete({
            where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
          }).catch(() => null);
          return;
        }

        const memberCount = voiceChannel.members?.size ?? 0;
        if (memberCount === 0) {
          try {
            await voiceChannel.delete('Temp VC empty — auto-deleted');
            await prisma.tempVoiceChannel.delete({
              where: { guildId_channelId: { guildId: guild.id, channelId: leftChannelId } },
            }).catch(() => null);
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
