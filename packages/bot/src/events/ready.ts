/**
 * clientReady event — fires once when the bot establishes its WebSocket session.
 * Applies presence configuration from the database, syncs all guild records,
 * caches invite data, and subscribes to the Redis `api:events` channel to handle
 * real-time commands from the web dashboard (settings reloads, presence updates,
 * reaction-role deployments, embed sends, and announcements).
 */
import { ActivityType, AttachmentBuilder, EmbedBuilder, type PresenceStatusData, type TextChannel } from 'discord.js';
import type { BotEvent } from '../types.js';
import { logger } from '../logger.js';
import { pub } from '../redis.js';
import { prisma } from '../database.js';
import { getGuildSettings } from '../utils/settings.js';

/** Shape of the `botConfig` singleton row used for presence configuration. */
type BotConfigRow = { activityType: string; activityText: string; status: string };

const TYPE_COLOR: Record<string, number> = {
  update: 0x5865f2,
  feature: 0x57f287,
  maintenance: 0xfee75c,
  hotfix: 0xed4245,
};

/**
 * Delivers a dashboard announcement embed to each target guild's configured
 * announcement channel. Per-guild colour overrides are applied when set.
 * Failures for individual guilds are logged and do not abort delivery to others.
 */
async function sendAnnouncement(
  client: import('../client.js').BotClient,
  data: { id: string; title: string; body: string; type: string; targets: Array<{ guildId: string; announcementChannelId: string }> },
): Promise<void> {
  const defaultColor = TYPE_COLOR[data.type] ?? TYPE_COLOR.update;
  const footer = `Arken Bot — ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`;

  let sent = 0;
  for (const target of data.targets) {
    try {
      const channel = client.channels.cache.get(target.announcementChannelId) as TextChannel | undefined;
      if (channel?.isTextBased()) {
        const guildSettings = await getGuildSettings(target.guildId);
        const color = guildSettings?.announcementColor
          ? parseInt(guildSettings.announcementColor.replace('#', ''), 16)
          : defaultColor;
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(data.title)
          .setDescription(data.body)
          .setFooter({ text: footer })
          .setTimestamp();
        await channel.send({ embeds: [embed] });
        sent++;
      }
    } catch (err) {
      logger.warn({ err, guildId: target.guildId }, 'Failed to send announcement to guild');
    }
  }
  logger.info({ id: data.id, sent, total: data.targets.length }, 'Announcement delivered');
}

/**
 * Applies a presence configuration to the bot, substituting `{servers}` and
 * `{users}` placeholders with live counts from the guild and user caches.
 */
function applyPresence(client: import('../client.js').BotClient, cfg: BotConfigRow): void {
  const typeMap: Record<string, ActivityType> = {
    Playing: ActivityType.Playing,
    Listening: ActivityType.Listening,
    Watching: ActivityType.Watching,
    Competing: ActivityType.Competing,
    Custom: ActivityType.Custom,
  };
  const text = cfg.activityText
    .replace('{servers}', String(client.guilds.cache.size))
    .replace('{users}', String(client.users.cache.size));

  client.user?.setPresence({
    activities: [{ name: text, type: typeMap[cfg.activityType] ?? ActivityType.Watching }],
    status: cfg.status as PresenceStatusData,
  });
}



const event: BotEvent = {
  name: 'clientReady',
  once: true,
  async execute(client: import('../client.js').BotClient) {
    logger.info(`Logged in as ${client.user?.tag}`);

    // Upsert guarantees the singleton row exists on first boot.
    const presenceCfg = await prisma.botConfig.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' },
    });
    applyPresence(client, presenceCfg);

    await pub.publish('bot:events', JSON.stringify({
      type: 'bot:ready',
      data: {
        username: client.user?.tag,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
      },
    }));

    const { ensureGuildExists, invalidateSettingsCache, invalidateAddonCache } = await import('../utils/settings.js');
    const { InviteTrackerModule } = await import('../modules/inviteTracker/InviteTrackerModule.js');
    for (const guild of client.guilds.cache.values()) {
      try {
        await ensureGuildExists(guild.id, guild.name, guild.ownerId, guild.iconURL() ?? undefined);
        await InviteTrackerModule.cacheGuild(guild);
      } catch (e) {
        logger.error(`Failed to sync guild ${guild.id}: ${e}`);
      }
    }
    logger.info(`Synced ${client.guilds.cache.size} guilds to database`);

    const { sub } = await import('../redis.js');

    sub.removeAllListeners('message');
    sub.on('message', async (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        if (event.type === 'settings:reload') {
          // Bust the Redis cache so the next command invocation fetches fresh settings.
          invalidateSettingsCache(event.data.guildId);
          logger.debug(`Settings cache invalidated for guild ${event.data.guildId}`);
        } else if (event.type === 'addon:install' || event.type === 'addon:uninstall') {
          invalidateAddonCache(event.data.guildId, event.data.addonName);
          logger.debug(`Addon cache invalidated for ${event.data.addonName} in guild ${event.data.guildId}`);
        } else if (event.type === 'bot:nickname:update') {
          const guild = client.guilds.cache.get(event.data.guildId as string);
          if (guild) {
            await guild.members.me?.setNickname(event.data.nickname as string | null);
            logger.info({ guildId: event.data.guildId, nickname: event.data.nickname }, 'Bot nickname updated');
          }
        } else if (event.type === 'bot:avatar:update') {
          const guild = client.guilds.cache.get(event.data.guildId as string);
          if (guild) {
            try {
              await guild.members.editMe({ avatar: (event.data.botAvatarUrl as string | null) ?? null });
              logger.info({ guildId: event.data.guildId }, 'Bot guild avatar updated');
            } catch (err) {
              logger.warn({ err, guildId: event.data.guildId }, 'Failed to update bot guild avatar');
            }
          }
        } else if (event.type === 'bot:presence:update') {
          applyPresence(client, event.data);
          logger.info('Bot presence updated');
        } else if (event.type === 'reaction-role:panel-upsert') {
          const { ReactionRolesModule } = await import('../modules/reactionRoles/ReactionRolesModule.js');
          await ReactionRolesModule.deployPanel(client, event.data.panelId);
        } else if (event.type === 'reaction-role:panel-delete') {
          const { ReactionRolesModule } = await import('../modules/reactionRoles/ReactionRolesModule.js');
          await ReactionRolesModule.deletePanel(client, event.data.guildId, event.data.channelId, event.data.messageId);
        } else if (event.type === 'bot:announcement') {
          await sendAnnouncement(client, event.data);
        } else if (event.type === 'stats-channels:refresh') {
          // Stats channels are updated by the BackgroundJobs scheduler on a 5-minute cycle;
          // this event is acknowledged but requires no immediate action.
        } else if (event.type === 'embeds:send') {
          const { guildId, channelId, embed } = event.data as {
            guildId: string;
            channelId: string;
            embed: Record<string, unknown> & { id: string };
          };
          try {
            const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
            if (!channel?.isTextBased()) {
              logger.warn({ guildId, channelId }, 'embeds:send — channel not found or not text-based');
              return;
            }

            const builder = new EmbedBuilder();
            const files: AttachmentBuilder[] = [];

            if (embed.embedColor) builder.setColor(embed.embedColor as `#${string}`);
            if (embed.embedTitle) builder.setTitle(embed.embedTitle as string);
            if (embed.embedDescription) builder.setDescription(embed.embedDescription as string);
            if (embed.embedUrl) builder.setURL(embed.embedUrl as string);
            if (embed.embedTimestamp) builder.setTimestamp();

            if (embed.embedAuthorName) {
              builder.setAuthor({
                name: embed.embedAuthorName as string,
                iconURL: (embed.embedAuthorIconUrl as string | null) ?? undefined,
                url: (embed.embedAuthorUrl as string | null) ?? undefined,
              });
            }

            if (embed.embedFooterText) {
              builder.setFooter({
                text: embed.embedFooterText as string,
                iconURL: (embed.embedFooterIconUrl as string | null) ?? undefined,
              });
            }

            // Converts a URL or base64 data URI to either a plain URL or a Discord
            // attachment reference, registering the attachment in `files` when needed.
            const resolveImage = (
              dataOrUrl: string | null | undefined,
              filename: string,
            ): string | null => {
              if (!dataOrUrl) return null;
              if (dataOrUrl.startsWith('data:')) {
                const m = dataOrUrl.match(/^data:image\/(\w+);base64,(.+)$/);
                if (!m) return null;
                const ext = m[1];
                const buffer = Buffer.from(m[2], 'base64');
                const name = `${filename}.${ext}`;
                files.push(new AttachmentBuilder(buffer, { name }));
                return `attachment://${name}`;
              }
              return dataOrUrl;
            };

            const thumbUrl = resolveImage(embed.embedThumbnailUrl as string | null, 'thumbnail');
            if (thumbUrl) builder.setThumbnail(thumbUrl);

            const imageUrl = resolveImage(embed.embedImageUrl as string | null, 'embed-image');
            if (imageUrl) builder.setImage(imageUrl);

            const fields = embed.embedFields as Array<{ name: string; value: string; inline?: boolean }> | undefined;
            if (Array.isArray(fields) && fields.length > 0) {
              builder.addFields(
                fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })),
              );
            }

            const sentMsg = await channel.send({
              content: (embed.messageContent as string | null) || undefined,
              embeds: [builder],
              files,
            });

            await prisma.guildEmbed.update({
              where: { id: embed.id },
              data: { lastSentMessageId: sentMsg.id, lastSentChannelId: sentMsg.channelId },
            }).catch(() => null);

            logger.info({ guildId, channelId }, 'Embed sent via dashboard');
          } catch (err) {
            logger.error({ err, guildId, channelId }, 'Failed to send dashboard embed');
          }
        }
      } catch {
        logger.error('Failed to process API event');
      }
    });

    await sub.subscribe('api:events');


    logger.info('Bot ready! Serving ' + client.guilds.cache.size + ' guilds');

  },
};

export default event;
