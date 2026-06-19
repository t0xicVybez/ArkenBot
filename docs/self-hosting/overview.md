---
id: self-hosting-overview
sidebar_label: Overview
---

# Self-Hosting ArkenBot

ArkenBot is a fully open-source Discord bot you can run on your own server. The stack is a **pnpm monorepo** with three long-running services managed by PM2:

| Service | Description |
|---|---|
| **bot** | The Discord bot process (discord.js) |
| **api** | Fastify REST API consumed by the dashboard |
| **web** | Next.js web dashboard |

## Requirements at a Glance

- Linux server (Ubuntu 22.04+ recommended)
- Node.js 20+, pnpm 9+
- PostgreSQL 15+
- Redis 7+
- PM2 (process manager)
- A Discord application with a bot token

## Setup Steps

Follow these guides in order:

1. [Prerequisites](prerequisites.md) — Install Node.js, PostgreSQL, Redis, and PM2
2. [Discord Setup](discord-setup.md) — Create your Discord application and bot token
3. [Installation](installation.md) — Clone the repo and configure environment variables
4. [Database](database.md) — Create the database and apply the schema
5. [Deployment](deployment.md) — Build, start with PM2, and set up Nginx + HTTPS
6. [Troubleshooting](troubleshooting.md) — Common issues and fixes
