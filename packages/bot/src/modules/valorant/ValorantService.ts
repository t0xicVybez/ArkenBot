/**
 * Thin wrapper over the official Riot VALORANT API (VAL-MATCH-V1) + RSO token
 * refresh. Dormant until a Production key is configured (`enabled` guards).
 *
 * Rank strategy: the official API has no direct "current MMR" endpoint, so we
 * derive competitive tier from the player's most recent Competitive match and
 * peak from recent matches. This is coded to Riot's documented shapes and may
 * need light tuning once we can test against a real production key.
 */
import axios from 'axios';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { valHost } from './constants.js';

interface MatchlistEntry { matchId: string; queueId?: string; gameStartTimeMillis?: number }
interface ValMatch {
  matchInfo?: { queueId?: string };
  players?: Array<{ puuid: string; competitiveTier?: number; stats?: { kills?: number; deaths?: number; assists?: number } }>;
}

export interface RankSnapshot { tier: number; peak: number; lastMatchId: string | null }
export interface MatchSummary { matchId: string; competitiveTier: number; kills: number; deaths: number; assists: number }

export class ValorantService {
  static get enabled(): boolean {
    return config.valorant.isConfigured;
  }

  private static riotHeaders(): Record<string, string> {
    return { 'X-Riot-Token': config.valorant.apiKey };
  }

  /** Recent match list for a PUUID (newest first). */
  static async matchlist(region: string, puuid: string): Promise<MatchlistEntry[]> {
    const host = valHost(region);
    const res = await axios.get(
      `https://${host}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${puuid}`,
      { headers: this.riotHeaders(), validateStatus: () => true, timeout: 10000 },
    );
    if (res.status >= 400) return [];
    return ((res.data as { history?: MatchlistEntry[] })?.history ?? []);
  }

  /** Full match details. */
  static async match(region: string, matchId: string): Promise<ValMatch | null> {
    const host = valHost(region);
    const res = await axios.get(
      `https://${host}.api.riotgames.com/val/match/v1/matches/${matchId}`,
      { headers: this.riotHeaders(), validateStatus: () => true, timeout: 10000 },
    );
    return res.status >= 400 ? null : (res.data as ValMatch);
  }

  /** Current competitive tier + peak, derived from recent Competitive matches. */
  static async deriveRank(region: string, puuid: string): Promise<RankSnapshot | null> {
    if (!this.enabled) return null;
    try {
      const history = await this.matchlist(region, puuid);
      if (!history.length) return { tier: 0, peak: 0, lastMatchId: null };
      const lastMatchId = history[0].matchId;
      const competitive = history.filter((m) => (m.queueId ?? '').toLowerCase() === 'competitive').slice(0, 5);
      let tier = 0;
      let peak = 0;
      for (let i = 0; i < competitive.length; i++) {
        const m = await this.match(region, competitive[i].matchId);
        const player = m?.players?.find((p) => p.puuid === puuid);
        const ct = typeof player?.competitiveTier === 'number' ? player.competitiveTier : 0;
        if (i === 0) tier = ct;
        peak = Math.max(peak, ct);
      }
      return { tier, peak, lastMatchId };
    } catch (err) {
      logger.warn({ err, puuid }, 'valorant deriveRank failed');
      return null;
    }
  }

  /** The most recent match's summary line for a player (for match-finished alerts). */
  static async lastMatchSummary(region: string, puuid: string): Promise<MatchSummary | null> {
    if (!this.enabled) return null;
    const history = await this.matchlist(region, puuid);
    if (!history.length) return null;
    const m = await this.match(region, history[0].matchId);
    const player = m?.players?.find((p) => p.puuid === puuid);
    if (!player) return null;
    return {
      matchId: history[0].matchId,
      competitiveTier: player.competitiveTier ?? 0,
      kills: player.stats?.kills ?? 0,
      deaths: player.stats?.deaths ?? 0,
      assists: player.stats?.assists ?? 0,
    };
  }
}
