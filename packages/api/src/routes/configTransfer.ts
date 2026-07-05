import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Server configuration export / import.
 *
 * Exports CONFIGURATION only — never user data (levels, warnings, cases,
 * birthdays, reputation) and never secrets (Monday API tokens, webhook
 * tokens). Records tied to Discord message IDs (reaction-role panels,
 * starboard entries) are excluded because those messages don't survive
 * a bot removal.
 */

const FORMAT = 'arkenbot-config';
const VERSION = 1;

/** Runtime/identity fields stripped from every exported record. */
const STRIP = new Set(['id', 'guildId', 'createdAt', 'updatedAt']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clean<T extends Record<string, any>>(row: T, extraStrip: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIP.has(k) || extraStrip.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function configTransferRoutes(server: FastifyInstance): Promise<void> {

  // ── GET /guilds/:guildId/config-export ────────────────────────────────────
  server.get('/guilds/:guildId/config-export', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const [
      guild, settings, automod, welcome, birthdayConfig, starboardConfig, suggestionConfig,
      levelRoles, xpRoleMultipliers, xpChannelMultipliers, slowmodeConfigs, customCommands,
      autoResponses, selfRoles, statsChannels, scheduledMessages, streamAlerts,
      tempVoiceTriggers, disabledCommands, commandRolePermissions, embeds, mondayAlerts,
    ] = await Promise.all([
      prisma.guild.findUnique({ where: { id: guildId }, select: { name: true } }),
      prisma.guildSettings.findUnique({ where: { guildId } }),
      prisma.autoModConfig.findUnique({ where: { guildId } }),
      prisma.welcomeConfig.findUnique({ where: { guildId } }),
      prisma.birthdayConfig.findUnique({ where: { guildId } }),
      prisma.starboardConfig.findUnique({ where: { guildId } }),
      prisma.suggestionConfig.findUnique({ where: { guildId } }),
      prisma.levelRole.findMany({ where: { guildId } }),
      prisma.xpRoleMultiplier.findMany({ where: { guildId } }),
      prisma.xpChannelMultiplier.findMany({ where: { guildId } }),
      prisma.slowmodeConfig.findMany({ where: { guildId } }),
      prisma.customCommand.findMany({ where: { guildId } }),
      prisma.autoResponse.findMany({ where: { guildId } }),
      prisma.selfRole.findMany({ where: { guildId } }),
      prisma.statsChannel.findMany({ where: { guildId } }),
      prisma.scheduledMessage.findMany({ where: { guildId } }),
      prisma.streamAlert.findMany({ where: { guildId } }),
      prisma.tempVoiceTrigger.findMany({ where: { guildId } }),
      prisma.disabledCommand.findMany({ where: { guildId } }),
      prisma.commandRolePermission.findMany({ where: { guildId } }),
      prisma.guildEmbed.findMany({ where: { guildId } }),
      prisma.mondayAlert.findMany({ where: { guildId } }),
    ]);

    const payload = {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      guildId,
      guildName: guild?.name ?? null,
      sections: {
        settings: settings ? clean(settings) : null,
        automod: automod ? clean(automod) : null,
        welcome: welcome ? clean(welcome) : null,
        birthdayConfig: birthdayConfig ? clean(birthdayConfig) : null,
        starboardConfig: starboardConfig ? clean(starboardConfig) : null,
        suggestionConfig: suggestionConfig ? clean(suggestionConfig) : null,
        levelRoles: levelRoles.map((r) => clean(r)),
        xpRoleMultipliers: xpRoleMultipliers.map((r) => clean(r)),
        xpChannelMultipliers: xpChannelMultipliers.map((r) => clean(r)),
        slowmodeConfigs: slowmodeConfigs.map((r) => clean(r)),
        customCommands: customCommands.map((r) => clean(r)),
        autoResponses: autoResponses.map((r) => clean(r)),
        selfRoles: selfRoles.map((r) => clean(r)),
        statsChannels: statsChannels.map((r) => clean(r)),
        // lastSentAt is runtime state; failure tracking restarts fresh
        scheduledMessages: scheduledMessages.map((r) => clean(r, ['lastSentAt', 'failureCount', 'lastError'])),
        // lastStreamId/lastMessage* are runtime state
        streamAlerts: streamAlerts.map((r) => clean(r, ['lastStreamId', 'lastMessageId', 'lastMessageChannelId', 'channelId'])),
        tempVoiceTriggers: tempVoiceTriggers.map((r) => clean(r)),
        disabledCommands: disabledCommands.map((r) => clean(r)),
        commandRolePermissions: commandRolePermissions.map((r) => clean(r)),
        embeds: embeds.map((r) => clean(r, ['lastSentMessageId', 'lastSentChannelId'])),
        // webhookToken and mondayApiToken are secrets — a fresh webhook URL is
        // generated on import and must be re-pasted into monday.com
        mondayAlerts: mondayAlerts.map((r) => clean(r, ['webhookToken', 'mondayApiToken'])),
      },
    };

    const safeName = (guild?.name ?? guildId).replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40);
    reply.header('Content-Disposition', `attachment; filename="arkenbot-config-${safeName}-${new Date().toISOString().slice(0, 10)}.json"`);
    return reply.send(payload);
  });

  // ── POST /guilds/:guildId/config-import ───────────────────────────────────
  // Replaces each section present in the file; sections absent from the file
  // are left untouched.
  server.post('/guilds/:guildId/config-import', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as Record<string, any>;

    if (body?.format !== FORMAT) {
      return reply.code(400).send({ success: false, error: 'Not an ArkenBot config file (missing format marker).' });
    }
    if (body.version !== VERSION) {
      return reply.code(400).send({ success: false, error: `Unsupported config version ${body.version} (expected ${VERSION}).` });
    }
    const sections = body.sections;
    if (!sections || typeof sections !== 'object') {
      return reply.code(400).send({ success: false, error: 'Config file has no sections.' });
    }

    const imported: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strip = (row: Record<string, any>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (STRIP.has(k)) continue;
        out[k] = v;
      }
      return out;
    };

    // One-to-one configs: upsert. Arrays: wipe and recreate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertOne = async (key: string, model: any) => {
      const data = sections[key];
      if (!data || typeof data !== 'object') return;
      const values = strip(data);
      await model.upsert({
        where: { guildId },
        update: values,
        create: { guildId, ...values },
      });
      imported[key] = 1;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const replaceMany = async (key: string, model: any) => {
      const rows = sections[key];
      if (!Array.isArray(rows)) return;
      await model.deleteMany({ where: { guildId } });
      let count = 0;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        try {
          await model.create({ data: { guildId, ...strip(row) } });
          count++;
        } catch { /* skip rows that no longer validate (e.g. schema drift) */ }
      }
      imported[key] = count;
    };

    try {
      await upsertOne('settings', prisma.guildSettings);
      await upsertOne('automod', prisma.autoModConfig);
      await upsertOne('welcome', prisma.welcomeConfig);
      await upsertOne('birthdayConfig', prisma.birthdayConfig);
      await upsertOne('starboardConfig', prisma.starboardConfig);
      await upsertOne('suggestionConfig', prisma.suggestionConfig);
      await replaceMany('levelRoles', prisma.levelRole);
      await replaceMany('xpRoleMultipliers', prisma.xpRoleMultiplier);
      await replaceMany('xpChannelMultipliers', prisma.xpChannelMultiplier);
      await replaceMany('slowmodeConfigs', prisma.slowmodeConfig);
      await replaceMany('customCommands', prisma.customCommand);
      await replaceMany('autoResponses', prisma.autoResponse);
      await replaceMany('selfRoles', prisma.selfRole);
      await replaceMany('statsChannels', prisma.statsChannel);
      await replaceMany('scheduledMessages', prisma.scheduledMessage);
      await replaceMany('streamAlerts', prisma.streamAlert);
      await replaceMany('tempVoiceTriggers', prisma.tempVoiceTrigger);
      await replaceMany('disabledCommands', prisma.disabledCommand);
      await replaceMany('commandRolePermissions', prisma.commandRolePermission);
      await replaceMany('embeds', prisma.guildEmbed);
      await replaceMany('mondayAlerts', prisma.mondayAlert);
    } catch (err) {
      request.log.error({ err, guildId }, 'config import failed');
      return reply.code(500).send({ success: false, error: 'Import failed part-way through — check the file and try again.' });
    }

    return reply.send({ success: true, data: { imported } });
  });
}
