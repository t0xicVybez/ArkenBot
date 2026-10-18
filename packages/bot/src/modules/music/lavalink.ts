/**
 * Lavalink playback engine. Talks to the local Lavalink node (see
 * /home/bot/lavalink) via lavalink-client instead of the in-process
 * yt-dlp → ffmpeg pipe, which offloads audio off the Node process and unlocks
 * filters, lyrics, Spotify, etc.
 *
 * Exposes the same surface as the yt-dlp engine (`IMusicQueue` + play/getQueue/
 * deleteQueue), so the MusicManager facade can route to it purely on the
 * MUSIC_ENGINE flag with no command changes. Nothing here connects until
 * initLavalink() runs, which the bot only calls when MUSIC_ENGINE=lavalink.
 */
import {
  type Guild,
  type VoiceBasedChannel,
  type User,
  type TextChannel,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { LavalinkManager, type Player, type Track as LavaTrack, type UnresolvedTrack } from 'lavalink-client';
import type { BotClient } from '../../client.js';
import { config } from '../../config.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { type Track, type IMusicQueue, type LoopMode, type PlayResult, fmtSecs } from './types.js';

let manager: LavalinkManager | null = null;
let botClient: BotClient | null = null;

// After the command prints the first "Now playing" embed itself, suppress the
// trackStart-driven embed once so the first track isn't announced twice. Later
// (auto-advanced) tracks still get the event embed, matching the yt-dlp engine.
const suppressNextNowPlaying = new Set<string>();

function toTrack(lt: LavaTrack | UnresolvedTrack): Track {
  const info = lt.info as { title?: string; uri?: string; duration?: number; isStream?: boolean; artworkUrl?: string };
  return {
    title: info.title ?? 'Unknown',
    url: info.uri ?? '',
    duration: info.isStream ? undefined : fmtSecs((info.duration ?? 0) / 1000),
    thumbnail: info.artworkUrl ?? undefined,
    requestedBy: lt.requester as User,
  };
}

/** Persist volume + loop so they survive a restart (parity with the yt-dlp engine). */
function persistState(player: Player): void {
  const loop: LoopMode = player.repeatMode === 'off' ? 'none' : player.repeatMode;
  void prisma.musicQueue.upsert({
    where: { guildId: player.guildId },
    update: { volume: player.volume, loop },
    create: { guildId: player.guildId, tracks: [], volume: player.volume, loop },
  }).catch(swallow);
}

async function sendNowPlaying(player: Player, track: Track): Promise<void> {
  if (!botClient || !player.textChannelId) return;
  const channel = botClient.channels.cache.get(player.textChannelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;
  const settings = await getGuildSettings(player.guildId);
  const loc = await resolveUserLocale({ user: { id: '' }, guildId: player.guildId });
  const color = settings?.musicColor ? parseInt(settings.musicColor.replace('#', ''), 16) : Colors.Blurple;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(t('music.nowPlayingTitle', loc))
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: t('music.requestedBy', loc), value: `<@${track.requestedBy?.id ?? '0'}>`, inline: true },
      ...(track.duration ? [{ name: t('music.duration', loc), value: track.duration, inline: true }] : []),
    )
    .setThumbnail(track.thumbnail ?? null);
  await channel.send({ embeds: [embed] }).catch(swallow);
}

async function sendPlaybackFailed(player: Player, track: Track | null, reason: string): Promise<void> {
  if (!botClient || !player.textChannelId || !track) return;
  const channel = botClient.channels.cache.get(player.textChannelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;
  const loc = await resolveUserLocale({ user: { id: '' }, guildId: player.guildId });
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(t('music.playbackFailedTitle', loc))
    .setDescription(t('music.playbackFailedDescription', loc, { title: track.title, reason: reason.slice(0, 200) }))
    .setFooter({ text: t('music.playbackFailedFooter', loc) });
  await channel.send({ embeds: [embed] }).catch(swallow);
}

/**
 * Create the Lavalink client, wire it to the gateway, and register player
 * events. Called from the bot bootstrap only when MUSIC_ENGINE=lavalink.
 */
export function initLavalink(client: BotClient): void {
  if (manager) return;
  botClient = client;

  manager = new LavalinkManager({
    nodes: [{
      id: 'main',
      host: config.lavalink.host,
      port: config.lavalink.port,
      authorization: config.lavalink.password,
      secure: config.lavalink.secure,
    }],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    playerOptions: {
      defaultSearchPlatform: 'ytsearch',
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: { destroyAfterMs: 300_000 },
    },
  });

  // Forward raw gateway voice packets so Lavalink can track voice state.
  client.on('raw', (d) => { void manager?.sendRawData(d); });

  client.once('clientReady', () => {
    void manager?.init({ id: client.user!.id, username: client.user!.username });
  });

  manager.nodeManager
    .on('connect', (node) => logger.info({ node: node.id }, 'Lavalink node connected'))
    .on('disconnect', (node, reason) => logger.warn({ node: node.id, reason }, 'Lavalink node disconnected'))
    .on('error', (node, err) => logger.error({ node: node.id, err: err?.message }, 'Lavalink node error'));

  manager
    .on('trackStart', (player, track) => {
      if (suppressNextNowPlaying.delete(player.guildId)) return;
      if (track) void sendNowPlaying(player, toTrack(track));
    })
    .on('trackError', (player, track, payload) => {
      logger.error({ guildId: player.guildId, track: track?.info?.title, err: payload?.exception?.message }, 'Lavalink track error');
      void sendPlaybackFailed(player, track ? toTrack(track) : null, payload?.exception?.message ?? 'playback error');
    })
    .on('trackStuck', (player, track) => {
      logger.warn({ guildId: player.guildId, track: track?.info?.title }, 'Lavalink track stuck');
      void sendPlaybackFailed(player, track ? toTrack(track) : null, 'the stream stalled');
    });

  logger.info({ host: config.lavalink.host, port: config.lavalink.port }, 'Lavalink engine initialised');
}

/** A LavalinkQueue is a thin IMusicQueue view over a lavalink-client Player. */
class LavalinkQueue implements IMusicQueue {
  constructor(private player: Player) {}

  get currentTrack(): Track | null {
    return this.player.queue.current ? toTrack(this.player.queue.current) : null;
  }
  get tracks(): Track[] {
    return this.player.queue.tracks.map(toTrack);
  }
  get loop(): LoopMode {
    return this.player.repeatMode === 'off' ? 'none' : this.player.repeatMode;
  }
  set loop(mode: LoopMode) {
    void this.player.setRepeatMode(mode === 'none' ? 'off' : mode);
    persistState(this.player);
  }

  pause(): boolean {
    if (this.player.paused) return false;
    void this.player.pause();
    return true;
  }
  resume(): boolean {
    if (!this.player.paused) return false;
    void this.player.resume();
    return true;
  }
  setVolume(vol: number): void {
    void this.player.setVolume(vol);
    persistState(this.player);
  }
  skip(): void {
    void this.player.skip().catch(swallow);
  }
  destroy(): void {
    void this.player.destroy().catch(swallow);
    void prisma.musicQueue.deleteMany({ where: { guildId: this.player.guildId } }).catch(swallow);
  }
}

/** Lavalink-backed engine with the same static surface as YtdlpManager. */
export class LavalinkEngine {
  static getQueue(guildId: string): IMusicQueue | undefined {
    const player = manager?.getPlayer(guildId);
    return player ? new LavalinkQueue(player) : undefined;
  }

  static deleteQueue(guildId: string): void {
    // Lavalink owns player lifecycle; destroy() already tears it down. Nothing
    // extra to drop here.
    void manager?.getPlayer(guildId)?.destroy().catch(swallow);
  }

  static async play(
    guild: Guild,
    voiceChannel: VoiceBasedChannel,
    query: string,
    requestedBy: User,
    textChannel?: TextChannel,
  ): Promise<PlayResult> {
    if (!manager) throw new Error('Music engine is not ready yet.');

    let player = manager.getPlayer(guild.id);
    if (!player) {
      const saved = await prisma.musicQueue.findUnique({ where: { guildId: guild.id } }).catch(swallow);
      player = manager.createPlayer({
        guildId: guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: textChannel?.id,
        selfDeaf: true,
        volume: saved?.volume ?? 100,
      });
      if (saved?.loop) void player.setRepeatMode(saved.loop === 'none' ? 'off' : (saved.loop as 'track' | 'queue'));
    } else if (textChannel) {
      player.textChannelId = textChannel.id;
    }

    if (!player.connected) await player.connect();

    let res;
    try {
      res = await player.search({ query }, requestedBy);
    } catch (err) {
      logger.error({ err }, 'Lavalink search failed');
      throw new Error('Could not find that track.');
    }
    if (!res || res.loadType === 'empty' || res.loadType === 'error' || !res.tracks.length) {
      throw new Error('Could not find that track.');
    }

    const wasEmpty = !player.queue.current && !player.playing;
    if (res.loadType === 'playlist') {
      await player.queue.add(res.tracks);
    } else {
      await player.queue.add(res.tracks[0]);
    }

    if (wasEmpty) suppressNextNowPlaying.add(guild.id);
    if (!player.playing && !player.paused) await player.play();

    const info = toTrack(res.tracks[0]);
    if (wasEmpty) {
      return { type: 'playing', title: info.title, duration: info.duration, thumbnail: info.thumbnail };
    }
    return { type: 'added', title: info.title, position: player.queue.tracks.length };
  }
}
