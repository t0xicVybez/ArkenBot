import {
  type Guild,
  type VoiceBasedChannel,
  type User,
  type TextChannel,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { YouTube } from 'youtube-sr';
import { prisma } from '../../database.js';
import { logger, swallow} from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

interface SerializedTrack {
  title: string;
  url: string;
  duration?: string;
  thumbnail?: string;
  requestedById: string;
  requestedByTag: string;
}

export interface Track {
  title: string;
  url: string;
  duration?: string;
  thumbnail?: string;
  requestedBy: User;
}

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/;

interface AudioStream {
  stream: import('stream').Readable;
  kill: () => void;
}

/** Spawn yt-dlp piped into ffmpeg. Returns the stream and a kill() to clean up both processes. */
function createAudioStream(videoUrl: string): AudioStream {
  const ytdlpArgs = [
    '-f', 'bestaudio/best',
    '--no-playlist',
    '-o', '-',
    '--quiet',
    '--no-warnings',
  ];
  if (process.env.YOUTUBE_COOKIES_FILE) {
    ytdlpArgs.push('--cookies', process.env.YOUTUBE_COOKIES_FILE);
  }
  // Route only yt-dlp (YouTube) traffic through a residential proxy when set, so
  // requests egress from a non-datacenter IP that YouTube does not block.
  if (process.env.YTDLP_PROXY) {
    ytdlpArgs.push('--proxy', process.env.YTDLP_PROXY);
  }
  ytdlpArgs.push(videoUrl);

  const ytdlp = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Suppress EPIPE errors on the pipe — these happen when we kill processes early
  ffmpeg.stdin!.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') logger.error({ err }, 'ffmpeg stdin error');
  });
  ytdlp.stdout!.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') logger.error({ err }, 'yt-dlp stdout error');
  });

  ytdlp.stdout.pipe(ffmpeg.stdin!);

  let ytdlpStderr = '';
  ytdlp.stderr.on('data', (d: Buffer) => { ytdlpStderr += d.toString(); });
  ytdlp.on('close', (code) => {
    if (code !== null && code !== 0) {
      const msg = ytdlpStderr.slice(-500);
      logger.error({ code, stderr: msg }, 'yt-dlp exited with error');
      ffmpeg.stdout?.destroy(new Error(`yt-dlp failed (exit ${code}): ${msg}`));
    }
  });

  let ffmpegStderr = '';
  ffmpeg.stderr!.on('data', (d: Buffer) => { ffmpegStderr += d.toString(); });
  ffmpeg.on('close', (code) => {
    if (code !== null && code !== 0) logger.debug({ code, stderr: ffmpegStderr.slice(-200) }, 'ffmpeg closed');
  });

  ffmpeg.on('error', (err) => logger.error({ err }, 'ffmpeg spawn error'));
  ytdlp.on('error', (err) => {
    logger.error({ err }, 'yt-dlp spawn error');
    ffmpeg.stdout?.destroy(err);
  });

  const kill = () => {
    // Unpipe first so Node.js stream buffers don't flush a burst of EPIPE writes
    // to a dead ffmpeg stdin. Then SIGKILL both processes simultaneously — only
    // one close event fires on ffmpeg.stdout, so onStreamError fires exactly once.
    try { ytdlp.stdout?.unpipe(ffmpeg.stdin!); } catch { /* ignore */ }
    try { ytdlp.kill('SIGKILL'); } catch { /* already dead */ }
    try { ffmpeg.kill('SIGKILL'); } catch { /* already dead */ }
  };

  return { stream: ffmpeg.stdout!, kill };
}

export class MusicQueue {
  public tracks: Track[] = [];
  public currentTrack: Track | null = null;
  public loop: 'none' | 'track' | 'queue' = 'none';
  public volume = 100;
  public guildId: string;
  public textChannel: TextChannel | null = null;
  private player: AudioPlayer;
  private connection: VoiceConnection;
  private resource: ReturnType<typeof createAudioResource> | null = null;
  private killStream: (() => void) | null = null;
  /** True while an intentional skip/destroy is in progress — suppresses the
   *  player error handler so a killed stream doesn't cause a spurious advance. */
  private isKilling = false;

  constructor(connection: VoiceConnection, guildId: string) {
    this.guildId = guildId;
    this.connection = connection;
    this.player = createAudioPlayer();
    connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => {
      // Do NOT reset isKilling here. player.stop() plays 5 silence frames (~100 ms)
      // before emitting Idle, so the killed stream's async error arrives AFTER this
      // handler and resets isKilling too early. The setTimeout in skip() owns the reset.
      if (this.loop === 'track' && this.currentTrack) {
        void this.playTrack(this.currentTrack, false);
        return;
      }
      if (this.loop === 'queue' && this.currentTrack) {
        this.tracks.push(this.currentTrack);
      }
      const next = this.tracks.shift();
      if (next) {
        void this.playTrack(next, true); // auto-advance → show now-playing
      } else {
        this.currentTrack = null;
        void this.saveToDb();
      }
    });

    this.player.on('error', (err) => {
      if (this.isKilling) {
        // Error is from an intentional kill (skip/destroy) — the Idle handler
        // will advance the queue; ignore this to prevent double-advance.
        logger.debug({ err }, 'Player error suppressed — intentional stream kill');
        return;
      }
      logger.error({ err }, 'Music player error');
      const failed = this.currentTrack;
      const next = this.tracks.shift();
      if (next) {
        void this.playTrack(next);
      } else {
        this.currentTrack = null;
      }
      if (failed) this.notifyError(failed, err.message);
    });
  }

  private notifyError(track: Track, reason: string): void {
    if (!this.textChannel) return;
    const channel = this.textChannel;
    void resolveUserLocale({ user: { id: '' }, guildId: this.guildId }).then((loc) => {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(t('music.playbackFailedTitle', loc))
        .setDescription(t('music.playbackFailedDescription', loc, { title: track.title, reason: reason.slice(0, 200) }))
        .setFooter({ text: t('music.playbackFailedFooter', loc) });
      channel.send({ embeds: [embed] }).catch(swallow);
    });
  }

  private notifyNowPlaying(track: Track): void {
    if (!this.textChannel) return;
    void getGuildSettings(this.guildId).then(async (settings) => {
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: this.guildId });
      const color = settings?.musicColor
        ? parseInt(settings.musicColor.replace('#', ''), 16)
        : Colors.Blurple;
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(t('music.nowPlayingTitle', loc))
        .setDescription(`**${track.title}**`)
        .addFields(
          { name: t('music.requestedBy', loc), value: `<@${track.requestedBy.id}>`, inline: true },
          ...(track.duration ? [{ name: t('music.duration', loc), value: track.duration, inline: true }] : []),
        )
        .setThumbnail(track.thumbnail ?? null);
      const msg = await this.textChannel?.send({ embeds: [embed] }).catch(swallow);
      if (msg) {
        await prisma.musicQueue.update({
          where: { guildId: this.guildId },
          data: { nowPlayingMessageId: msg.id, nowPlayingChannelId: msg.channelId },
        }).catch(swallow);
      }
    });
  }

  async saveToDb(): Promise<void> {
    try {
      const serialized: SerializedTrack[] = [
        ...(this.currentTrack ? [serializeTrack(this.currentTrack)] : []),
        ...this.tracks.map(serializeTrack),
      ];
      // Cast through unknown — Prisma's Json type doesn't accept typed arrays directly
      const tracksJson = JSON.parse(JSON.stringify(serialized));
      await prisma.musicQueue.upsert({
        where: { guildId: this.guildId },
        update: { tracks: tracksJson, volume: this.volume, loop: this.loop },
        create: { guildId: this.guildId, tracks: tracksJson, volume: this.volume, loop: this.loop },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to persist music queue');
    }
  }

  async playTrack(track: Track, isAutoAdvance = false): Promise<void> {
    this.currentTrack = track;
    void this.saveToDb();

    if (isAutoAdvance) this.notifyNowPlaying(track);

    try {
      logger.info({ title: track.title }, 'Starting yt-dlp → ffmpeg pipeline');

      // Kill any previous stream processes before starting new ones
      this.killStream?.();
      this.killStream = null;

      const { stream: audioStream, kill } = createAudioStream(track.url);
      this.killStream = kill;

      // If the stream errors (yt-dlp failure), notify and advance.
      // Skip when isKilling — the error came from an intentional kill, not a
      // genuine playback failure, and the Idle handler owns the advance.
      audioStream.once('error', (err: Error) => {
        if (this.isKilling) return;
        logger.error({ err, title: track.title }, 'Audio stream error');
        const failed = this.currentTrack;
        this.killStream?.();
        this.killStream = null;
        const next = this.tracks.shift();
        if (next) void this.playTrack(next, true);
        else this.currentTrack = null;
        if (failed) this.notifyError(failed, err.message);
      });

      this.resource = createAudioResource(audioStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      this.resource.volume?.setVolume(this.volume / 100);
      this.player.play(this.resource);
    } catch (err) {
      logger.error({ err }, 'Failed to play track');
      this.killStream?.();
      this.killStream = null;
      this.notifyError(track, (err as Error).message);
      const next = this.tracks.shift();
      if (next) void this.playTrack(next, true);
      else this.currentTrack = null;
    }
  }

  skip(): void {
    this.isKilling = true;
    this.killStream?.();
    this.killStream = null;
    this.player.stop();
    // Reset after 1 s — well beyond the window in which any async stream error
    // from the killed ffmpeg process can arrive and trigger the error handler.
    setTimeout(() => { this.isKilling = false; }, 1000);
  }
  pause(): boolean { return this.player.pause(); }
  resume(): boolean { return this.player.unpause(); }

  setVolume(vol: number): void {
    this.volume = vol;
    this.resource?.volume?.setVolume(vol / 100);
  }

  destroy(): void {
    this.isKilling = true;
    this.killStream?.();
    this.killStream = null;
    this.player.stop();
    this.connection.destroy();
    void prisma.musicQueue.deleteMany({ where: { guildId: this.guildId } }).catch(swallow);
  }
}

export class MusicManager {
  private static queues = new Map<string, MusicQueue>();

  static getQueue(guildId: string): MusicQueue | undefined {
    return this.queues.get(guildId);
  }

  static deleteQueue(guildId: string): void {
    this.queues.delete(guildId);
  }

  static async play(
    guild: Guild,
    voiceChannel: VoiceBasedChannel,
    query: string,
    requestedBy: User,
    textChannel?: TextChannel,
  ): Promise<{ type: 'playing' | 'added'; title: string; position?: number; duration?: string; thumbnail?: string }> {
    let trackInfo: { title: string; url: string; duration?: string; thumbnail?: string };

    try {
      if (YT_URL_RE.test(query)) {
        // Direct YouTube URL — get metadata from youtube-sr
        const video = await YouTube.getVideo(query);
        trackInfo = {
          title: video?.title ?? 'Unknown',
          url: query,
          duration: video?.durationFormatted,
          thumbnail: video?.thumbnail?.url,
        };
      } else {
        // Search query — search YouTube for metadata, stream via Invidious
        const results = await YouTube.search(query, { limit: 1, type: 'video' });
        const video = results[0];
        if (!video?.url) throw new Error('No results found');
        trackInfo = {
          title: video.title ?? 'Unknown',
          url: video.url,
          duration: video.durationFormatted,
          thumbnail: video.thumbnail?.url,
        };
      }
    } catch (err) {
      logger.error({ err }, 'Music search/info failed');
      throw new Error('Could not find that track.');
    }

    const track: Track = { ...trackInfo, requestedBy };
    let queue = this.queues.get(guild.id);

    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      } catch (err) {
        const failedStatus = connection.state.status;
        logger.error({ status: failedStatus, err }, 'Voice connection failed to reach Ready state');
        connection.destroy();
        this.queues.delete(guild.id);
        throw new Error(`Could not connect to voice channel (stuck at: ${failedStatus}).`);
      }

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          connection.destroy();
          this.queues.delete(guild.id);
        }
      });

      queue = new MusicQueue(connection, guild.id);
      this.queues.set(guild.id, queue);

      // Store text channel for auto-advance and error notifications
      if (textChannel) queue.textChannel = textChannel;

      // Restore persisted volume/loop from DB (tracks are replayed fresh, not auto-resumed)
      const saved = await prisma.musicQueue.findUnique({ where: { guildId: guild.id } }).catch(swallow);
      if (saved) {
        queue.volume = saved.volume;
        queue.loop = saved.loop as 'none' | 'track' | 'queue';
      }
    }

    // Always update text channel to the latest interaction channel
    if (textChannel) queue.textChannel = textChannel;

    if (!queue.currentTrack) {
      await queue.playTrack(track, false);
      return { type: 'playing', title: track.title, duration: track.duration, thumbnail: track.thumbnail };
    } else {
      queue.tracks.push(track);
      void queue.saveToDb();
      return { type: 'added', title: track.title, position: queue.tracks.length };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeTrack(track: Track): SerializedTrack {
  return {
    title: track.title,
    url: track.url,
    duration: track.duration,
    thumbnail: track.thumbnail,
    requestedById: track.requestedBy.id,
    requestedByTag: track.requestedBy.tag,
  };
}
