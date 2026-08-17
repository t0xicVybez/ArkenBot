/**
 * guildCreate event — runs when the bot joins a new guild. Ensures the guild
 * record exists in the database, immediately deploys application commands to the
 * guild, and publishes a join event to the Redis pub/sub channel.
 */
import {
  REST,
  Routes,
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
  type User,
} from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { ensureGuildExists } from '../utils/settings.js';
import { logger, swallow} from '../logger.js';
import { pub } from '../redis.js';
import { config } from '../config.js';
import { t, resolveUserLocale } from '../i18n/index.js';
import { localizeCommandJSON } from '../i18n/commandLocalizations.js';

const DASHBOARD_URL = 'https://arkenbot.app/dashboard';
const DOCS_URL = 'https://docs.arkenbot.app/';
const SUPPORT_URL = 'https://discord.gg/fXJnYPdHRX';

/**
 * Sends the onboarding message after joining a guild. Prefers a DM to whoever
 * added the bot (from the audit log), then the guild owner, and finally falls
 * back to the guild's system channel or the first text channel we can post in.
 */
async function sendWelcomeMessage(guild: Guild): Promise<void> {
  const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t('onboarding.title', loc))
    .setDescription(t('onboarding.description', loc, { server: guild.name }))
    .addFields(
      {
        name: t('onboarding.step1Name', loc),
        value: t('onboarding.step1Value', loc, { dashboardUrl: DASHBOARD_URL, server: guild.name }),
      },
      {
        name: t('onboarding.step2Name', loc),
        value: t('onboarding.step2Value', loc),
      },
      {
        name: t('onboarding.step3Name', loc),
        value: t('onboarding.step3Value', loc, { docsUrl: DOCS_URL }),
      },
    )
    .setFooter({ text: t('onboarding.footer', loc) })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('onboarding.buttonDashboard', loc)).setURL(DASHBOARD_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('onboarding.buttonDocs', loc)).setURL(DOCS_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t('onboarding.buttonSupport', loc)).setURL(SUPPORT_URL),
  );

  const payload = { embeds: [embed], components: [row] };

  // 1) DM whoever added the bot, if the audit log is readable.
  let inviter: User | null = null;
  try {
    if (guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
      const entry = logs.entries.find((e) => e.target?.id === guild.client.user?.id);
      const executor = entry?.executor ?? null;
      // Audit log executors can be partial — fetch the full user before DMing.
      inviter = executor ? await guild.client.users.fetch(executor.id).catch(swallow) : null;
    }
  } catch { /* no audit log access — fall through */ }

  if (inviter && !inviter.bot) {
    const sent = await inviter.send(payload).then(() => true).catch(() => false);
    if (sent) {
      logger.info({ guildId: guild.id, userId: inviter.id }, 'Welcome message DMed to inviter');
      return;
    }
  }

  // 2) DM the guild owner.
  const owner = await guild.fetchOwner().catch(swallow);
  if (owner && owner.id !== inviter?.id) {
    const sent = await owner.send(payload).then(() => true).catch(() => false);
    if (sent) {
      logger.info({ guildId: guild.id, userId: owner.id }, 'Welcome message DMed to owner');
      return;
    }
  }

  // 3) Fall back to a channel in the guild.
  const me = guild.members.me;
  const canPost = (ch: GuildBasedChannel | null): ch is TextChannel =>
    !!ch && ch.type === ChannelType.GuildText && !!me &&
    ch.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

  const channel = canPost(guild.systemChannel)
    ? guild.systemChannel
    : guild.channels.cache
        .filter((ch): ch is TextChannel => canPost(ch))
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first() ?? null;

  if (channel) {
    const sent = await channel.send(payload).then(() => true).catch(() => false);
    if (sent) {
      logger.info({ guildId: guild.id, channelId: channel.id }, 'Welcome message posted in guild channel');
      return;
    }
  }

  logger.warn({ guildId: guild.id }, 'Could not deliver welcome message (DMs closed, no writable channel)');
}


const event: BotEvent = {
  name: 'guildCreate',
  async execute(_client: unknown, guild: Guild) {
    logger.info(`Joined guild: ${guild.name} (${guild.id})`);

    await ensureGuildExists(
      guild.id,
      guild.name,
      guild.ownerId,
      guild.iconURL() ?? undefined
    );

    // Commands are registered per-guild immediately rather than waiting for the next
    // global deploy cycle, so members can use slash commands straight away.
    try {
      const client = _client as BotClient;
      const commands = [...client.commands.values()].map((cmd) => localizeCommandJSON(cmd.data.toJSON()));
      const rest = new REST({ version: '10' }).setToken(config.discord.token);
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guild.id),
        { body: commands },
      );
      logger.info(`Deployed ${commands.length} commands to new guild ${guild.name} (${guild.id})`);
    } catch (err) {
      logger.error({ err }, `Failed to deploy commands to guild ${guild.id}`);
    }

    await pub.publish('bot:events', JSON.stringify({
      type: 'guild:joined',
      data: { guildId: guild.id, name: guild.name, memberCount: guild.memberCount },
    }));

    await sendWelcomeMessage(guild).catch((err) => {
      logger.error({ err, guildId: guild.id }, 'Failed to send welcome message');
    });
  },
};

export default event;
