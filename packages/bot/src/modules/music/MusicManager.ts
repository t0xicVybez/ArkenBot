/**
 * Music facade. Routes to one of two interchangeable engines based on the
 * MUSIC_ENGINE flag:
 *   - 'ytdlp'    → the legacy in-process yt-dlp → ffmpeg player (./ytdlp.ts)
 *   - 'lavalink' → the Lavalink node via lavalink-client (./lavalink.ts)
 *
 * Both expose the same static surface (play/getQueue/deleteQueue) and hand back
 * the same `IMusicQueue`, so every slash command imports `MusicManager` from
 * here and never cares which engine is live. The default is 'ytdlp', so turning
 * on Lavalink is an explicit, instantly-reversible env flip.
 */
import { config } from '../../config.js';
import { YtdlpManager } from './ytdlp.js';
import { LavalinkEngine, initLavalink } from './lavalink.js';

export type { Track, IMusicQueue, LoopMode } from './types.js';
export { initLavalink };

// Resolved once at startup — the engine doesn't change at runtime. Routing to
// the class itself (not a wrapper object) keeps each engine's `this` intact.
export const MusicManager = config.music.engine === 'lavalink' ? LavalinkEngine : YtdlpManager;
