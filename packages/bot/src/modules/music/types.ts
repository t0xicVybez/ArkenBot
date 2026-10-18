/**
 * Shared music types. Both playback engines (yt-dlp and Lavalink) resolve songs
 * into the same `Track` shape and expose the same `IMusicQueue` surface, so the
 * slash commands (and the MusicManager facade) don't care which engine is live.
 */
import type { User } from 'discord.js';

export type LoopMode = 'none' | 'track' | 'queue';

export interface Track {
  title: string;
  url: string;
  duration?: string;
  thumbnail?: string;
  requestedBy: User;
}

export interface SerializedTrack {
  title: string;
  url: string;
  duration?: string;
  thumbnail?: string;
  requestedById: string;
  requestedByTag: string;
}

/**
 * One guild's player, as the commands use it. Both the yt-dlp `MusicQueue` and
 * the Lavalink-backed queue implement this, so `pause`/`resume`/`skip`/… and
 * the `currentTrack`/`tracks`/`loop` fields work the same regardless of engine.
 */
export interface IMusicQueue {
  currentTrack: Track | null;
  tracks: Track[];
  loop: LoopMode;
  pause(): boolean;
  resume(): boolean;
  setVolume(vol: number): void;
  skip(): void;
  destroy(): void;
}

/** Result of a play request — the commands render an embed from this. */
export interface PlayResult {
  type: 'playing' | 'added';
  title: string;
  position?: number;
  duration?: string;
  thumbnail?: string;
}

export interface MusicEngine {
  play(
    guild: import('discord.js').Guild,
    voiceChannel: import('discord.js').VoiceBasedChannel,
    query: string,
    requestedBy: User,
    textChannel?: import('discord.js').TextChannel,
  ): Promise<PlayResult>;
  getQueue(guildId: string): IMusicQueue | undefined;
  deleteQueue(guildId: string): void;
}

/** Format a duration in seconds as m:ss (or h:mm:ss). */
export function fmtSecs(s: number): string {
  const sec = Math.floor(s % 60), min = Math.floor((s / 60) % 60), hr = Math.floor(s / 3600);
  const mm = hr ? String(min).padStart(2, '0') : String(min);
  return (hr ? `${hr}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
}

export function serializeTrack(track: Track): SerializedTrack {
  return {
    title: track.title,
    url: track.url,
    duration: track.duration,
    thumbnail: track.thumbnail,
    requestedById: track.requestedBy.id,
    requestedByTag: track.requestedBy.tag,
  };
}
