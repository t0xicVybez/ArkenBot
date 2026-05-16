# Music Commands

Control music playback in voice channels. Join a voice channel before using these commands.

---

## /play

Play a song or add it to the queue.

| Option | Required | Description |
|---|---|---|
| `query` | Yes | Song name to search, or a YouTube/Spotify URL |

If music is already playing, the song is added to the end of the queue.

---

## /skip

Skip the current song and play the next one in the queue.

No options.

---

## /pause

Pause the current song without clearing the queue.

No options.

---

## /resume

Resume a paused song.

No options.

---

## /stop

Stop playback and clear the entire queue.

No options.

---

## /queue

View the current music queue. Shows the now-playing track and upcoming songs.

No options.

---

## /volume

Set the playback volume.

| Option | Required | Description |
|---|---|---|
| `level` | Yes | Volume level (1–100) |

---

## /loop

Set the loop mode.

| Option | Required | Description |
|---|---|---|
| `mode` | Yes | `Off`, `Track` (repeat current song), or `Queue` (repeat entire queue) |

---

## /nowplaying

Show the currently playing track with a progress bar, artist info, and queue position.

No options.
