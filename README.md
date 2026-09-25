<div align="center">

# ArkenBot

### The Discord bot that does everything, elegantly.

Replace a stack of single-purpose bots with **one permanently free**, self-hostable solution — moderation, leveling, economy, tickets, giveaways, music, live alerts, and full game-server management — all configured from a **real-time web dashboard** and localized in **14 languages**.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE.txt)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**[🌐 Website](https://arkenbot.app)** · **[📖 Docs](https://docs.arkenbot.app)** · **[➕ Add to Discord](https://discord.com/oauth2/authorize?client_id=1477178407543373834&permissions=8824675416665207&integration_type=0&scope=bot+applications.commands)** · **[💬 Support Server](https://discord.gg/fXJnYPdHRX)**

<a href="https://www.buymeacoffee.com/corylynch8d" target="_blank"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=corylynch8d&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me A Coffee" height="42" /></a>

</div>

---

## Why ArkenBot?

Most servers run half a dozen bots — one for moderation, one for tickets, one for leveling, another for music — each with its own clunky config and its own monthly bill. ArkenBot brings **50+ features** together behind a single, elegant dashboard where **changes apply the moment you hit Save**, no restarts required.

- **💸 Free forever** — no paywalls, no premium tiers, no feature gates. Every module ships to every server.
- **⚡ Real-time dashboard** — toggle modules, edit embeds, and manage tickets in the browser; updates reach the running bot instantly over Redis.
- **🌍 14 languages** — every reply, embed, modal, and dashboard page is fully localized (English, Spanish, French, German, Italian, Dutch, Portuguese, Russian, Polish, Turkish, Indonesian, Japanese, Korean, Simplified Chinese).
- **🧩 Extensible** — a first-class addon SDK lets you bolt on commands, dashboard panels, and background jobs without forking core.
- **🏠 Self-hostable** — open source under GPLv3; run your own instance on your own infrastructure.

## ✨ Features

| Category | What you get |
|---|---|
| 🛡️ **Moderation** | Ban, kick, mute, warn, notes, temp-roles, purge, and full case tracking — plus right-click (context-menu) ban/timeout/warn and member verification |
| 🌐 **Cross-Server Ban Network** | Opt-in federated ban list — flag or auto-action members already banned across the network, with a configurable threshold |
| 🤖 **Auto-Mod & Anti-Nuke** | Spam, word/link, invite, and caps filters; anti-raid and anti-nuke protection with an audit trail |
| 📈 **Leveling & XP** | Rank cards, leaderboards, level roles, XP multipliers, XP decay, and role sync |
| 💰 **Economy & Gambling** | Balances, bank, daily/work income, pay & trade, shop & inventory, rob, plus blackjack, dice, and a server lottery |
| 🎉 **Engagement** | Achievements, reputation (`/rep`), starboard, birthdays, giveaways, polls, and suggestions |
| 🎫 **Support & Applications** | Multi-panel ticket systems with SLA, transcripts & ratings, a modmail inbox, and an applications/forms flow — all with a staff portal |
| 🎮 **Game Servers** | Live status & management for **50+ games** — Minecraft, Rust, ARK, Palworld, Valheim, FiveM, CS2, DayZ, 7 Days to Die, and many more |
| 🔔 **Live Alerts** | Go-live / new-post notifications from **Twitch, Kick, YouTube, Reddit & RSS** |
| 📋 **Project Boards** | Bring **Trello** and **Monday.com** boards into Discord — track cards and items without leaving your server |
| 🎵 **Music** | Playback with queue, skip, loop, and volume controls |
| 🧩 **Utilities** | Custom auto-responses, reaction & self roles, welcome/leave messages, scheduled announcements, live stats channels, counting, temp voice channels, invite tracking, confessions, and FAQ |
| 📊 **Analytics** | Daily message/join/leave metrics with 30-day dashboard charts |

> 🎮 **Game-server management is a first-class feature**, powered by our own **GameQuery** engine — query and monitor 50+ game types straight from Discord.

## 🖥️ The Dashboard

Every feature is configured through a **Next.js web dashboard** backed by a live WebSocket gateway. Toggle modules, edit embeds, and manage tickets in the browser — updates propagate to the running bot in real time via Redis, with **no restarts**.

<div align="center">

<img src="assets/screenshots/dashboard-overview.png" alt="ArkenBot dashboard" width="90%">

<br><br>

<img src="assets/screenshots/Tickets-overview.png" alt="Ticket system overview" width="49%">
<img src="assets/screenshots/Tickets-view.png" alt="Ticket detail with timeline and transcript" width="49%">

<br><br>

<img src="assets/screenshots/game-servers.png" alt="Live game-server status in Discord" width="420">

<sub><em>Live game-server status, right in Discord.</em></sub>

</div>

## 🏗️ Architecture

A **pnpm + TypeScript monorepo** running as coordinated services under PM2:

```
arkenbot/
├── packages/
│   ├── bot/          # Discord.js v14 gateway client
│   ├── api/          # Fastify 5 REST API + WebSocket gateway (:4000)
│   ├── web/          # Next.js 16 dashboard (:3000)
│   ├── shared/       # Shared types & utilities
│   └── addon-sdk/    # SDK for building first- and third-party addons
├── addons/           # ai · applications · tickets · gameservers · gameadmin ·
│                     #   confessions · faq · github-monitor · code-review · examples
└── prisma/           # PostgreSQL schema
```

| Layer | Technology |
|---|---|
| Bot | Discord.js v14, TypeScript |
| API | Fastify 5, native WebSocket |
| Dashboard | Next.js 16, React 19, Tailwind CSS 4 |
| Database | PostgreSQL + Prisma 7 ORM |
| Cache / Queue / Pub-Sub | Redis (ioredis + BullMQ) |
| Auth | Discord OAuth2 + JWT |
| i18n | 14 fully hand-translated locales |

## 🧩 Addon System

Features ship as **addons** auto-discovered from `addons/` at boot. Build your own against the `@arkenbot/addon-sdk` — register commands, dashboard panels, and background jobs without touching core. First-party addons include `tickets`, `gameservers`, `gameadmin`, `ai` (`/ask`, `/summarize`), `applications`, `confessions`, `faq`, `github-monitor`, and `code-review`; `example-*` addons are there as templates.

## 🚀 Self-Hosting

### Prerequisites
- **Node.js ≥ 20** and **pnpm ≥ 9**
- **PostgreSQL** and **Redis**
- A [Discord application](https://discord.com/developers/applications) (bot token + OAuth2 credentials)

### Setup

```bash
# 1. Clone & install
git clone https://github.com/t0xicVybez/ArkenBot.git
cd ArkenBot
pnpm install

# 2. Configure
cp .env.example .env
#   → fill in DISCORD_TOKEN, DISCORD_CLIENT_ID/SECRET, DATABASE_URL, REDIS_URL, …

# 3. Set up the database
pnpm db:generate
pnpm db:push

# 4. Register slash commands
pnpm deploy:commands

# 5. Run everything in dev (bot + api + web)
pnpm dev
```

The dashboard comes up on **http://localhost:3000**, the API on **http://localhost:4000**.

### Production

```bash
pnpm build            # build all packages
./deploy.sh           # build bot + api + web, then pm2 startOrReload
```

`deploy.sh` always rebuilds before reloading PM2 so the running services match source. Pass `--prisma` to run a schema push first, or name packages (`./deploy.sh api web`) to build a subset.

## ⚙️ Configuration

Key environment variables (see [`.env.example`](.env.example) for the full list):

| Group | Variables |
|---|---|
| **Discord** *(required)* | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` |
| **Data** *(required)* | `DATABASE_URL`, `REDIS_URL`, `REDIS_PASSWORD` |
| **API / Web** | `API_PORT`, `API_SECRET`, `JWT_*`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `CORS_ORIGIN` |
| **Alerts** *(optional)* | `TWITCH_CLIENT_ID/SECRET` (Twitch go-live); `YOUTUBE_API_KEY` (optional — YouTube & Reddit fall back to quota-free RSS, and RSS/Reddit need no keys) |
| **Music** *(optional)* | `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` |
| **Meta** | `BOT_OWNER_IDS`, `LOG_LEVEL`, `NODE_ENV`, `TOPGG_TOKEN` |

## 🤝 Contributing

Contributions are welcome! Open an issue to discuss a feature or bug, or send a PR. A great first contribution is a new addon built on the `addon-sdk`.

## 📄 License

Licensed under the **GNU General Public License v3.0** — see [LICENSE.txt](LICENSE.txt).

<div align="center">
<sub>Built with ❤️ for Discord communities.</sub>
</div>
