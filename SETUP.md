# ArkenBot — Setup & Deployment Guide

This guide walks you through installing and running ArkenBot from source on a Linux server (Ubuntu 22.04 or later recommended). The stack is a **pnpm monorepo** containing three long-running processes — the Discord bot, a Fastify REST API, and a Next.js web dashboard — all managed by PM2.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create the Discord Application](#2-create-the-discord-application)
3. [Clone the Repository](#3-clone-the-repository)
4. [Configure Environment Variables](#4-configure-environment-variables)
5. [Database Setup (PostgreSQL)](#5-database-setup-postgresql)
6. [Install Dependencies & Build](#6-install-dependencies--build)
7. [Deploy Slash Commands](#7-deploy-slash-commands)
8. [Run in Production with PM2](#8-run-in-production-with-pm2)
9. [Nginx Reverse Proxy (Optional)](#9-nginx-reverse-proxy-optional)
10. [Lavalink — Music Support (Optional)](#10-lavalink--music-support-optional)
11. [Addons](#11-addons)
12. [Updating](#12-updating)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

Install the following on your server before proceeding.

### Node.js 20+ and pnpm

```bash
# Install Node.js 20 LTS via the NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm globally
npm install -g pnpm

# Verify
node --version   # v20.x.x or higher
pnpm --version   # 9.x.x or higher
```

### PostgreSQL 15+

```bash
sudo apt-get install -y postgresql postgresql-contrib

# Start and enable the service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Redis 7+

```bash
sudo apt-get install -y redis-server

sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### PM2 (process manager)

```bash
npm install -g pm2
```

### Git

```bash
sudo apt-get install -y git
```

---

## 2. Create the Discord Application

### 2a. Create the Application

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name (e.g. "ArkenBot") and click **Create**.
3. Note the **Application ID** — this is your `DISCORD_CLIENT_ID`.

### 2b. Create the Bot

1. In the left sidebar click **Bot**.
2. Click **Add Bot** → **Yes, do it!**
3. Under **Token**, click **Reset Token** and copy the value. This is your `DISCORD_TOKEN`. **Store it securely — it grants full control of the bot.**
4. Enable the following **Privileged Gateway Intents**:
   - **Server Members Intent** — required for welcome messages, invite tracking, and leveling.
   - **Message Content Intent** — required for AutoMod, counting game, and custom commands.

### 2c. OAuth2 Setup

1. In the left sidebar click **OAuth2** → **General**.
2. Copy the **Client Secret**. This is your `DISCORD_CLIENT_SECRET`.
3. Under **Redirects**, click **Add Redirect** and enter your callback URL:
   - Local development: `http://localhost:3000/auth/callback`
   - Production: `https://yourdomain.com/auth/callback`
4. Note the redirect URL — this is your `DISCORD_REDIRECT_URI`.

### 2d. Invite the Bot to Your Server

1. In the left sidebar click **OAuth2** → **URL Generator**.
2. Under **Scopes** select: `bot`, `applications.commands`.
3. Under **Bot Permissions** select at minimum:
   - **Administrator** (simplest for testing, restrict later if preferred)
   - Or fine-grained: Manage Roles, Manage Channels, Kick/Ban Members, Read/Send Messages, Manage Messages, Add Reactions, Embed Links, Attach Files, View Channel.
4. Copy the generated URL and open it in a browser to add the bot to your server.

---

## 3. Clone the Repository

```bash
git clone https://github.com/your-org/arkenbot.git
cd arkenbot
```

---

## 4. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
nano .env      # or use your preferred editor
```

The `.env` file lives in the **repository root** and is loaded by all three services. See the comments in `.env.example` for a full explanation of every variable. The required variables are:

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

> **Important — NEXT_PUBLIC_* variables:** These are embedded into the Next.js build at compile time, not at runtime. If you change them you must rebuild the `web` package.

---

## 5. Database Setup (PostgreSQL)

### 5a. Create the database and user

```bash
sudo -u postgres psql
```

```sql
CREATE USER arkenbot WITH PASSWORD 'your_secure_password';
CREATE DATABASE arkenbot OWNER arkenbot;
GRANT ALL PRIVILEGES ON DATABASE arkenbot TO arkenbot;
\q
```

Update `DATABASE_URL` in your `.env` accordingly:

```
DATABASE_URL=postgresql://arkenbot:your_secure_password@localhost:5432/arkenbot
```

### 5b. Apply the schema

```bash
# Push the Prisma schema to the database and regenerate the client
pnpm db:push
```

This command creates all tables. Re-run it any time the schema changes (new features or updates). Alternatively, for a production migration workflow:

```bash
pnpm db:migrate      # applies pending migrations
pnpm db:generate     # regenerates the Prisma client
```

---

## 6. Install Dependencies & Build

```bash
# Install all workspace dependencies
pnpm install

# Build everything in dependency order:
# shared → addon-sdk → (addons) → api → bot → web
pnpm build
```

This may take a few minutes on the first run. Subsequent builds are faster because TypeScript only recompiles changed files.

---

## 7. Deploy Slash Commands

Slash commands must be registered with Discord before users can see them. Run this once after first setup and again any time you add or rename commands:

```bash
pnpm deploy:commands
```

> If `DISCORD_GUILD_ID` is set in `.env`, commands register instantly to that guild (useful for testing). Without it, commands register globally and may take up to an hour to appear.

---

## 8. Run in Production with PM2

PM2 keeps all three services alive, restarts them on crash, and manages logs. The included `ecosystem.config.cjs` configures all three processes.

```bash
# Start all three services
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View live logs (all services)
pm2 logs

# View logs for one service
pm2 logs api
pm2 logs bot
pm2 logs web

# Save the process list so PM2 restores it after a server reboot
pm2 save

# Configure PM2 to start automatically on boot
pm2 startup
# Follow the printed instruction (it will output a command to run as root)
```

### Restarting after changes

After rebuilding any package, restart the affected service:

```bash
pm2 restart api
pm2 restart bot
pm2 restart web
```

Or restart everything at once:

```bash
pm2 restart all
```

---

## 9. Nginx Reverse Proxy (Optional)

If you want the dashboard and API accessible at standard ports (80/443) behind a domain name, configure Nginx as a reverse proxy.

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/arkenbot`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Web dashboard
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # REST API
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket (live stats, etc.)
    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/arkenbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot will automatically configure HTTPS and set up auto-renewal. After obtaining the certificate, update your `.env` URLs to use `https://` and `wss://`, then rebuild the web package and restart the `web` PM2 process.

---

## 10. Lavalink — Music Support (Optional)

The music commands require a running [Lavalink](https://lavalink.dev) server. If you do not want music commands, you can skip this section — all other features work without it.

1. Download the latest `Lavalink.jar` from the [Lavalink releases](https://github.com/lavalink-devs/Lavalink/releases).
2. Create an `application.yml` configuration file (the Lavalink docs provide a template).
3. Start Lavalink: `java -jar Lavalink.jar`
4. Set the following in your `.env`:

```
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass    # Must match your application.yml password
LAVALINK_SECURE=false
```

**YouTube playback:** Server IPs are sometimes blocked by YouTube. If music fails, export cookies from your browser using the "Get cookies.txt LOCALLY" Chrome extension while logged into YouTube, save the file, and set:

```
YOUTUBE_COOKIES_FILE=/path/to/youtube-cookies.txt
```

---

## 11. Addons

Addons are self-contained feature packages located in the `addons/` directory. They are loaded automatically from a path configured in Guild Settings in the dashboard.

### Available addons

| Addon | Directory | Description |
|---|---|---|
| **Code Review** | `addons/code-review` | Reviews code snippets with static analysis + optional Groq AI |
| **Tickets** | `addons/tickets` | Full support ticket system with transcripts |
| **Game Servers** | `addons/gameservers` | Query and display live game server stats |
| **ARK Manager** | `addons/ark-manager` | ARK: Survival Evolved server control via RCON |
| **Rust Manager** | `addons/rust-manager` | Rust server control via RCON |
| **Minecraft Manager** | `addons/minecraft-manager` | Minecraft server control via RCON |
| **FiveM Manager** | `addons/fivem-manager` | FiveM server status via the built-in HTTP API |
| **Palworld Manager** | `addons/palworld-manager` | Palworld server management |

### Building addons

Addons with a `build` step must be compiled before they can be used:

```bash
pnpm --filter tickets build
pnpm --filter @arkenbot/addon-gameservers build
# etc.
```

### Developing a custom addon

See `addons/example-greeting/src/index.ts` and `addons/example-economy/src/index.ts` for minimal working examples. The `@arkenbot/addon-sdk` package provides all types and helpers you need:

```typescript
import { defineAddon } from '@arkenbot/addon-sdk';

export default defineAddon({
  name: 'my-addon',
  version: '1.0.0',
  description: 'What this addon does',
  commands: [/* your BotCommand objects */],
  events: [/* your BotEvent objects */],
});
```

---

## 12. Updating

Pull the latest code, rebuild, and restart:

```bash
git pull

pnpm install          # pick up any new dependencies
pnpm db:push          # apply any schema changes (safe to run when nothing changed)
pnpm build            # rebuild all packages

pm2 restart all
```

If the Prisma schema changed you may also need to regenerate the client:

```bash
pnpm db:generate
```

---

## 13. Troubleshooting

### PM2 process not found

If running PM2 commands as a different user from the one that started the processes, prefix commands with `sudo -u <user>`. For example, if PM2 was started by a `bot` system user:

```bash
sudo -u bot pm2 status
sudo -u bot pm2 restart all
```

### Commands not appearing in Discord

- Make sure `pnpm deploy:commands` completed without errors.
- Global commands (no `DISCORD_GUILD_ID` set) can take up to 60 minutes to propagate.
- Guild-specific commands appear immediately. Set `DISCORD_GUILD_ID` in `.env` during development.

### Dashboard login fails

- Verify `DISCORD_REDIRECT_URI` in `.env` exactly matches the redirect URL registered in the Discord Developer Portal (including the protocol and path).
- Check that the API service is running and reachable: `curl http://localhost:4000/health`
- Check the API logs: `pm2 logs api`

### Database connection errors

- Confirm PostgreSQL is running: `sudo systemctl status postgresql`
- Test the connection string manually: `psql "postgresql://arkenbot:password@localhost:5432/arkenbot" -c "SELECT 1;"`
- Ensure the `DATABASE_URL` in `.env` does not have surrounding quotes.

### Build permission errors in `.next`

The `.next` build directory is created by the Next.js build process and must be writable by the user running the build. If you switch between running builds as different users, fix ownership before rebuilding:

```bash
sudo chown -R <build-user>:<group> packages/web/.next
```

### Redis connection errors

- Confirm Redis is running: `sudo systemctl status redis-server`
- Test: `redis-cli ping` — should return `PONG`.
- If your Redis instance has a password, set `REDIS_PASSWORD` in `.env`.

### Music commands not working

- Confirm Lavalink is running and reachable on the configured host/port.
- Check the bot logs for Lavalink connection errors: `pm2 logs bot`
- If you see YouTube 403 errors, set up a `YOUTUBE_COOKIES_FILE` (see [Section 10](#10-lavalink--music-support-optional)).

---

## Quick Reference

```bash
# Start all services
pm2 start ecosystem.config.cjs

# Rebuild and restart a single service
pnpm --filter @arkenbot/api build && pm2 restart api
pnpm --filter @arkenbot/bot build && pm2 restart bot
pnpm --filter @arkenbot/web build && pm2 restart web

# Apply a Prisma schema change
pnpm db:push && pnpm db:generate && pm2 restart all

# Deploy slash commands
pnpm deploy:commands

# View all logs
pm2 logs

# Grant staff access in the dashboard to a Discord user
pnpm grant-staff <discord-user-id>
```
