---
id: self-hosting-installation
sidebar_label: Installation
---

# Installation

## Clone the Repository

```bash
git clone https://github.com/t0xicVybez/ArkenBot.git
cd ArkenBot
```

## Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

The `.env` file lives in the repository root and is loaded by all three services. Required variables:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret |
| `DISCORD_REDIRECT_URI` | OAuth2 callback URL (must match the portal exactly) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_SECRET` | Random secret for signing JWTs — generate with `openssl rand -hex 32` |
| `BOT_OWNER_IDS` | Your Discord user ID (grants bot-owner access to the dashboard) |
| `NEXT_PUBLIC_API_URL` | Public URL of the API (browser-facing, baked into the Next.js bundle) |
| `NEXT_PUBLIC_WS_URL` | Public WebSocket URL of the API |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Same value as `DISCORD_CLIENT_ID` |
| `CORS_ORIGIN` | URL of the web dashboard (e.g. `http://localhost:3000`) |
| `WEB_URL` | Public URL of the web dashboard |

> **Important:** `NEXT_PUBLIC_*` variables are baked into the Next.js bundle at compile time. If you change them you must rebuild the `web` package.

---

Next: [Database](database.md)
