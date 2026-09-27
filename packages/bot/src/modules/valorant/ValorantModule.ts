/**
 * VALORANT orchestration: periodic rank sync, rank→role automation, match-finished
 * alerts, and Discord-activity presence roles. All no-ops while the integration
 * is unconfigured (ValorantService.enabled === false).
 */
import { EmbedBuilder, type Guild, type GuildMember, type TextChannel, type Presence } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { ValorantService } from './ValorantService.js';
import { TIER_NAMES, tierBase, tierName, tierColor } from './constants.js';
import type { BotClient } from '../../client.js';

const ALL_RANK_ROLE_IDS = (rankRoles: Record<string, string>): Set<string> => new Set(Object.values(rankRoles));

export class ValorantModule {
  /** Guilds with presence roles enabled — cached so presenceUpdate (very hot) can
   *  bail without a DB hit. Refreshed by the sync job; empty while dormant. */
  static presenceGuilds = new Set<string>();

  /** Sync a batch of the least-recently-synced links (keeps us under Riot rate limits). */
  static async syncBatch(client: BotClient, limit = 20): Promise<void> {
    if (!ValorantService.enabled) return;
    // refresh the presence-guild cache each cycle
    const pg = await prisma.valorantGuildConfig.findMany({
      where: { enabled: true, presenceEnabled: true, presenceRoleId: { not: null } },
      select: { guildId: true },
    });
    this.presenceGuilds = new Set(pg.map((c) => c.guildId));
    const links = await prisma.valorantLink.findMany({
      orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      take: limit,
    });
    for (const link of links) {
      const snap = await ValorantService.deriveRank(link.region, link.puuid);
      if (!snap) continue;
      const matchChanged = snap.lastMatchId && snap.lastMatchId !== link.lastMatchId;
      await prisma.valorantLink.update({
        where: { id: link.id },
        data: {
          currentTier: snap.tier,
          peakTier: Math.max(snap.peak, link.peakTier ?? 0),
          lastMatchId: snap.lastMatchId ?? link.lastMatchId,
          lastSyncAt: new Date(),
        },
      });
      await this.applyEverywhere(client, link.discordId, snap.tier).catch(swallow);
      if (matchChanged) await this.alertEverywhere(client, link.discordId, link.region, link.puuid, link.gameName, link.tagLine).catch(swallow);
    }
  }

  /** Apply the rank role in every enabled guild the member belongs to. */
  static async applyEverywhere(client: BotClient, discordId: string, tier: number): Promise<void> {
    const configs = await prisma.valorantGuildConfig.findMany({ where: { enabled: true, syncRolesEnabled: true } });
    for (const cfg of configs) {
      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (member) await this.applyRankRoles(guild, member, cfg.rankRoles as Record<string, string>, tier).catch(swallow);
    }
  }

  /** Remove any other mapped rank roles and grant the one for this tier. */
  static async applyRankRoles(guild: Guild, member: GuildMember, rankRoles: Record<string, string>, tier: number): Promise<void> {
    const target = rankRoles[tierBase(tier)];
    const managed = ALL_RANK_ROLE_IDS(rankRoles);
    for (const roleId of managed) {
      const has = member.roles.cache.has(roleId);
      if (roleId === target && !has) {
        await member.roles.add(roleId, 'VALORANT rank sync').catch((e) => notifyActionFailure(guild, { action: 'manageRoles', error: e, requiredPermission: 'Manage Roles', target: member.toString() }));
      } else if (roleId !== target && has) {
        await member.roles.remove(roleId, 'VALORANT rank sync').catch(swallow);
      }
    }
  }

  /** Post a match-finished alert in every enabled guild the member is in. */
  static async alertEverywhere(client: BotClient, discordId: string, region: string, puuid: string, gameName: string, tagLine: string): Promise<void> {
    const configs = await prisma.valorantGuildConfig.findMany({ where: { enabled: true, matchAlertsEnabled: true, alertChannelId: { not: null } } });
    if (!configs.length) return;
    const summary = await ValorantService.lastMatchSummary(region, puuid);
    if (!summary) return;
    for (const cfg of configs) {
      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild || !guild.members.cache.has(discordId)) continue;
      const channel = guild.channels.cache.get(cfg.alertChannelId!) as TextChannel | undefined;
      if (!channel?.isTextBased()) continue;
      const embed = new EmbedBuilder()
        .setColor(tierColor(summary.competitiveTier))
        .setAuthor({ name: `${gameName}#${tagLine}` })
        .setDescription(`Finished a Competitive match — **${summary.kills}/${summary.deaths}/${summary.assists}** · ${tierName(summary.competitiveTier)}`)
        .setFooter({ text: 'VALORANT' })
        .setTimestamp();
      await channel.send({ content: `<@${discordId}>`, embeds: [embed] }).catch(swallow);
    }
  }

  /** Immediate role sync for one member (e.g. right after they link). */
  static async syncMember(guild: Guild, discordId: string): Promise<void> {
    if (!ValorantService.enabled) return;
    const [cfg, link] = await Promise.all([
      prisma.valorantGuildConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.valorantLink.findUnique({ where: { discordId } }),
    ]);
    if (!cfg?.enabled || !cfg.syncRolesEnabled || !link) return;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member && typeof link.currentTier === 'number') {
      await this.applyRankRoles(guild, member, cfg.rankRoles as Record<string, string>, link.currentTier).catch(swallow);
    }
  }

  /** Presence-based "Playing VALORANT" role toggle. */
  static async handlePresence(oldP: Presence | null, newP: Presence): Promise<void> {
    // Hot path: bail without a DB hit unless this guild has presence roles on.
    if (!ValorantService.enabled || !newP.guild || !newP.member || !this.presenceGuilds.has(newP.guild.id)) return;
    const cfg = await prisma.valorantGuildConfig.findUnique({ where: { guildId: newP.guild.id } });
    if (!cfg?.enabled || !cfg.presenceEnabled || !cfg.presenceRoleId) return;
    const role = newP.guild.roles.cache.get(cfg.presenceRoleId);
    if (!role) return;
    const playing = (p: Presence | null) => (p?.activities ?? []).some((a) => a.name.toLowerCase() === 'valorant');
    const wasPlaying = playing(oldP);
    const nowPlaying = playing(newP);
    if (nowPlaying === wasPlaying) return;
    const member = newP.member;
    if (nowPlaying && !member.roles.cache.has(role.id)) {
      await member.roles.add(role.id, 'Playing VALORANT').catch(swallow);
    } else if (!nowPlaying && member.roles.cache.has(role.id)) {
      await member.roles.remove(role.id, 'Stopped playing VALORANT').catch(swallow);
    }
  }

  /** Tier names for the dashboard rank→role mapping UI (server-side helper). */
  static tierList(): string[] {
    return [...new Set(TIER_NAMES.map((n) => n.replace(/\s*\d+$/, '')))].filter((t) => t !== 'Unranked');
  }
}
