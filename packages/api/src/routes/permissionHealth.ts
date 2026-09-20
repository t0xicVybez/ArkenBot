/**
 * Reports which permissions the bot is missing in a guild — server-wide and
 * per-channel — so the dashboard can show a "Permission Health" panel. Computes
 * effective permissions from the guild's roles and each channel's permission
 * overwrites using Discord's documented algorithm (the API has no gateway state,
 * so it derives this from REST data with the bot token).
 */
import type { FastifyInstance } from 'fastify';
import { isSnowflake } from '@arkenbot/shared';
import { requireGuildAdmin } from '../middleware/auth.js';

const F = {
  ADMINISTRATOR:   1n << 3n,
  VIEW_AUDIT_LOG:  1n << 7n,
  VIEW_CHANNEL:    1n << 10n,
  SEND_MESSAGES:   1n << 11n,
  ADD_REACTIONS:   1n << 6n,
  EMBED_LINKS:     1n << 14n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD:    1n << 5n,
  MANAGE_MESSAGES: 1n << 13n,
  MANAGE_ROLES:    1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_NICKNAMES: 1n << 27n,
  BAN_MEMBERS:     1n << 2n,
  KICK_MEMBERS:    1n << 1n,
  MODERATE_MEMBERS: 1n << 40n,
};

// Guild-wide permissions the bot's features rely on (Discord's own labels).
const NEEDED_GUILD: [bigint, string][] = [
  [F.VIEW_AUDIT_LOG, 'View Audit Log'],
  [F.MANAGE_ROLES, 'Manage Roles'],
  [F.MANAGE_CHANNELS, 'Manage Channels'],
  [F.MANAGE_GUILD, 'Manage Server'],
  [F.BAN_MEMBERS, 'Ban Members'],
  [F.KICK_MEMBERS, 'Kick Members'],
  [F.MODERATE_MEMBERS, 'Timeout Members'],
  [F.MANAGE_MESSAGES, 'Manage Messages'],
  [F.MANAGE_WEBHOOKS, 'Manage Webhooks'],
  [F.MANAGE_NICKNAMES, 'Manage Nicknames'],
];

type Role = { id: string; permissions: string; position: number; name: string };
type Overwrite = { id: string; type: number; allow: string; deny: string };
type Channel = { id: string; name: string; type: number; permission_overwrites?: Overwrite[] };

/** Computes a channel's effective permissions for the bot per Discord's algorithm. */
function channelPerms(base: bigint, isAdmin: boolean, ch: Channel, guildId: string, botRoleIds: Set<string>, botId: string): bigint {
  if (isAdmin) return ~0n;
  let perms = base;
  const ow = ch.permission_overwrites ?? [];
  const everyone = ow.find((o) => o.id === guildId);
  if (everyone) perms = (perms & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const o of ow) {
    if (o.type === 0 && o.id !== guildId && botRoleIds.has(o.id)) { allow |= BigInt(o.allow); deny |= BigInt(o.deny); }
  }
  perms = (perms & ~deny) | allow;
  const member = ow.find((o) => o.type === 1 && o.id === botId);
  if (member) perms = (perms & ~BigInt(member.deny)) | BigInt(member.allow);
  return perms;
}

export async function permissionHealthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/guilds/:guildId/permission-health', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    // Constrain guildId to a Discord snowflake before it flows into any outbound
    // request URL (prevents SSRF / path injection via the route param).
    if (!isSnowflake(guildId)) return reply.code(400).send({ success: false, error: 'Invalid guild ID' });
    const token = process.env.DISCORD_TOKEN;
    const botId = process.env.DISCORD_CLIENT_ID;
    if (!token || !botId) return reply.code(500).send({ success: false, error: 'Bot credentials not configured' });

    try {
      const { default: axios } = await import('axios');
      const headers = { Authorization: `Bot ${token}` };
      const base = `https://discord.com/api/v10/guilds/${guildId}`;

      const memberRes = await axios.get<{ roles: string[] }>(`${base}/members/${botId}`, { headers, validateStatus: () => true });
      if (memberRes.status === 404) {
        return reply.send({ success: true, data: { botInGuild: false, administrator: false, missing: [], channels: [] } });
      }
      const [rolesRes, channelsRes] = await Promise.all([
        axios.get<Role[]>(`${base}/roles`, { headers }),
        axios.get<Channel[]>(`${base}/channels`, { headers }),
      ]);

      const roleMap = new Map(rolesRes.data.map((r) => [r.id, r]));
      const botRoleIds = new Set(memberRes.data.roles ?? []);

      // Base guild permissions = @everyone + all of the bot's roles.
      let guildPerms = 0n;
      const everyone = roleMap.get(guildId);
      if (everyone) guildPerms |= BigInt(everyone.permissions);
      let botHighest = 0;
      for (const rid of botRoleIds) {
        const r = roleMap.get(rid);
        if (r) { guildPerms |= BigInt(r.permissions); botHighest = Math.max(botHighest, r.position); }
      }
      const isAdmin = (guildPerms & F.ADMINISTRATOR) === F.ADMINISTRATOR;

      const missing = isAdmin ? [] : NEEDED_GUILD.filter(([flag]) => (guildPerms & flag) !== flag).map(([, label]) => label);

      // Per-channel: text (0) and announcement (5) channels the bot can't fully use.
      const channelIssues: { id: string; name: string; missing: string[] }[] = [];
      if (!isAdmin) {
        for (const ch of channelsRes.data.filter((c) => c.type === 0 || c.type === 5)) {
          const cp = channelPerms(guildPerms, isAdmin, ch, guildId, botRoleIds, botId);
          const m: string[] = [];
          if ((cp & F.VIEW_CHANNEL) !== F.VIEW_CHANNEL) {
            m.push('View Channel');
          } else {
            if ((cp & F.SEND_MESSAGES) !== F.SEND_MESSAGES) m.push('Send Messages');
            if ((cp & F.EMBED_LINKS) !== F.EMBED_LINKS) m.push('Embed Links');
            if ((cp & F.ADD_REACTIONS) !== F.ADD_REACTIONS) m.push('Add Reactions');
          }
          if (m.length) channelIssues.push({ id: ch.id, name: ch.name, missing: m });
          if (channelIssues.length >= 25) break;
        }
      }

      return reply.send({ success: true, data: { botInGuild: true, administrator: isAdmin, botHighestPosition: botHighest, missing, channels: channelIssues } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error({ err, guildId }, 'Failed to compute permission health');
      return reply.code(500).send({ success: false, error: `Failed to check permissions: ${msg}` });
    }
  });
}
