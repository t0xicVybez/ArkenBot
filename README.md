# Arken Bot

Multi-purpose Discord bot with a web dashboard and addon system. Built with Discord.js v14, TypeScript, Fastify 5, Next.js 15, PostgreSQL, and Redis.

## Repository Structure

```
arkenbot/
├── packages/
│   ├── bot/          # Discord.js v14 bot
│   ├── api/          # Fastify 5 REST API + WebSocket gateway
│   ├── web/          # Next.js 15 web dashboard
│   ├── shared/       # Shared TypeScript types and utilities
│   └── addon-sdk/    # SDK for building addons
├── addons/           # First-party addons
│   ├── fivem-manager/
│   ├── minecraft-manager/
│   ├── ark-manager/
│   ├── rust-manager/
│   ├── palworld-manager/
│   ├── tickets/
│   └── code-review/
└── prisma/           # PostgreSQL schema
```

## Built-in Features

| Category | Features |
|---|---|
| Moderation | Ban, kick, mute, warn, temp-ban, case tracking, audit logs |
| Auto-Mod | Spam filter, word/link filter, caps detection, anti-raid |
| Leveling & XP | XP earning, rank cards, leaderboard, level roles, XP multipliers, keep/remove previous roles, bulk role sync |
| Level-Up Announcements | Rich embeds, milestone images (levels 5, 10, 25, 50, 75, 100+), daily message streaks |
| XP Decay | Automatic XP reduction for inactive members, configurable threshold and percent |
| Achievements | 10+ unlock-able badges awarded automatically (level milestones, streaks, message counts) |
| Reputation | `/rep give/check/top`, 24 h cooldown per user, Redis-backed |
| Server Analytics | Daily message, command, join, and leave counters; 30-day chart in dashboard |
| Music | YouTube playback, queue, skip, loop, volume, persistent state |
| Support Tickets | Multi-panel, SLA, transcripts, ratings, staff portal (via addon) |
| Custom Commands | Rich embeds, variables, cooldowns, role restrictions |
| Reaction Roles | Button panels, toggle/add-only/remove-only modes |
| Welcome & Leave | Custom embeds, DM on join, leave notifications |
| Giveaways | Slash command creation, auto winner selection |
| Stream Alerts | Twitch, Kick, Twitter, Reddit & RSS notifications |
| Starboard | Reaction-threshold message highlights |
| Suggestions | Member submission, staff approval workflow |
| Birthdays | Auto-announcement + 24 h role |
| Stats Channels | Live member/boost stat voice channels |
| Scheduled Messages | Recurring embeds on any interval |
| Game Server Management | FiveM, Minecraft, Rust, ARK, Palworld (via addons) |

## Tech Stack

| Component   | Technology                          |
|-------------|-------------------------------------|
| Bot         | Discord.js v14, TypeScript          |
| API         | Fastify 5, TypeScript               |
| Database    | PostgreSQL + Prisma ORM             |
| Cache/Queue | Redis + ioredis + BullMQ            |
| Frontend    | Next.js 15, React 19, Tailwind CSS  |
| Real-time   | WebSocket (native via Fastify)      |
| Auth        | Discord OAuth2 + JWT                |
| Music       | yt-dlp + @discordjs/voice + ffmpeg  |
