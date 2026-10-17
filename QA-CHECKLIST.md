# ArkenBot — Manual QA Checklist

Run this in a **test guild** where ArkenBot is present and you have admin + dashboard access.
Automated tests (178) cover pure logic, schema validation, DB storage, API routes (via inject),
and a web HTTP smoke. This checklist covers what they can't reach: real Discord interactions
(slash commands, buttons, modals), visual rendering, and third-party integrations.

Legend: ⬜ not checked · ✅ pass · ❌ fail (note what happened)

---

## P0 — Recently fixed (verify these first)

- ⬜ **Leveling save** — Dashboard → Leveling: change **XP per message** (15→50) → saves, no "Failed to save".
- ⬜ **Leveling save** — toggle **XP decay**, set decay days/percent, toggle **keep previous roles** → each saves.
- ⬜ **Leveling save** — edit **level-up message** + toggle **level-up embed** → saves.
- ⬜ **Bot avatar** — Dashboard → Settings: upload a ~2–3MB PNG as the per-server avatar → "avatar updated", and the bot's avatar changes in the guild.
- ⬜ **Embed image** — Dashboard → Embeds: create an embed with a ~2–3MB image/thumbnail → saves and sends.
- ⬜ **`/help`** — run `/help` → opens without error, pages through categories; **Utility shows as "Utility (1/2)"** (it has >25 commands) and both pages render.
- ⬜ **`/play <search terms>`** — e.g. `/play lofi` → finds and plays a track (no "Could not find that track").
- ⬜ **Welcome message** — set a normal welcome message → a test join posts it; a very long one still posts (truncated), not silently dropped.
- ⬜ **Promotion tracking** — set a status/name with the server's vanity → `/promotion` shows accrued time.
- ⬜ **Settings for a guild the bot isn't in** — (if reproducible) saving returns a clean "add the bot first" message, not a server error.

## P1 — Core features (happy path per category)

### Moderation
- ⬜ `/ban`, `/kick`, `/mute` (timeout), `/unban` — action applies; a mod-log entry + case number appears.
- ⬜ `/warn` → `/warnings` lists it → `/clearwarnings` removes it.
- ⬜ `/purge <n>` — bulk-deletes messages.
- ⬜ Right-click a user → Apps → **Ban / Timeout / Warn** (context-menu commands) work.
- ⬜ `/case`, `/note` — view/manage cases and staff notes.
- ⬜ Temp ban/role expiry — set a short temp ban/role; it lifts automatically within ~1 min.

### Leveling & economy
- ⬜ Chatting grants XP; `/rank` shows a rank card image; `/leaderboard` renders.
- ⬜ Level-up announcement fires; level-reward roles granted at the configured level.
- ⬜ `/daily`, `/balance`, `/pay`, `/work`, `/gamble` (coinflip/dice), `/shop` + buy, `/lottery` — all behave.

### Tickets
- ⬜ Create a panel (dashboard) → it posts; clicking it **opens a ticket channel** (no "Failed to create ticket channel"; if it fails, the log now shows the cause).
- ⬜ Claim / close / reopen / transfer a ticket; canned response insert; rating prompt on close.
- ⬜ Tickets + transcript appear in the dashboard (Tickets / Stats pages).

### Automod & safety
- ⬜ Trip a rule (spam / banned word / invite link) → the configured action (delete/warn/mute) fires.
- ⬜ Anti-phishing: post a known-scam-style link → handled.
- ⬜ Verification gate: a new member gets the pending role; clicking **Verify** grants the member role.
- ⬜ Anti-nuke: (carefully, in a throwaway guild) rapid channel/role deletes trip the threshold.

### Community & utility
- ⬜ `/poll` create → vote buttons work → it closes with a results chart.
- ⬜ `/giveaway` create → enter → ends and picks a winner.
- ⬜ `/suggest` → suggestion posts with 👍/👎 → staff manage it.
- ⬜ `/remind` fires at the right time; `/birthday` set + announcement.
- ⬜ Reaction roles: react on the panel → role granted; remove reaction → role removed.
- ⬜ Self-roles, starboard (star a message → it reposts), stats channels update.
- ⬜ `/serverinfo`, `/userinfo`, `/avatar`, `/ping` render correctly.

### Music
- ⬜ `/play` (URL and search), `/queue`, `/skip`, `/pause`, `/resume`, `/stop`, `/volume`, `/loop` all work in a voice channel.

## P2 — Integrations & addons

- ⬜ Stream alerts (Twitch/Kick/YouTube/Reddit) — configure one; a go-live/new post posts an alert.
- ⬜ top.gg vote — vote → reward + thank-you fires (if TOPGG configured).
- ⬜ Trello / Monday — connect, add an alert; a board change posts to Discord.
- ⬜ GitHub monitor — watch a repo; a commit/release posts.
- ⬜ Translate addon — `/translate`, right-click translate, flag-reaction translate.
- ⬜ Game servers / game-admin (if a server is linked) — status + RCON commands.
- ⬜ Valorant — **dormant** until Riot prod key; confirm it degrades gracefully (no errors).

## P3 — Dashboard (each page loads + saves)

For every page: **loads without error, shows real data (your guild), a change saves and persists on reload.**
- ⬜ Overview, Settings, Leveling, Economy, Moderation, Automod, Welcome, Logging, Reaction Roles,
  Self Roles, Starboard, Giveaways, Polls, Suggestions, Tickets (+ Panels/Settings/Stats/Canned),
  Stream Alerts, RSS Feeds, Birthdays, Scheduled Messages, Stats Channels, Temp Voice, Slowmode,
  Analytics, Invite Tracker, Permissions, Commands, Embeds, Setup wizard, Announcements, Personalization.
- ⬜ Staff portal (if staff): Guilds, Users, Metrics, Service Logs, Moderation, Announcements, Addons, Settings.
- ⬜ Language switch (`/language` + dashboard locale) — UI + bot replies change language.

## P4 — Edge cases (the bug classes we hunted)

- ⬜ Delete a record (embed, panel, alert, poll) from the wrong context → clean 404, never a 500.
- ⬜ Save settings while Discord/Redis briefly unavailable → recovers; no stuck state.
- ⬜ A reaction-role panel with a deleted/invalid emoji → bot skips it and warns (panel still works for valid emojis).
- ⬜ Very long inputs (welcome message, embed description) → truncated/handled, not a crash.

---

**After a pass:** note any ❌ with steps to reproduce; most feature code has no automated coverage,
so this checklist is the real acceptance gate for "everything works." Re-run P0 after any deploy.
