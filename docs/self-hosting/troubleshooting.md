---
id: self-hosting-troubleshooting
sidebar_label: Troubleshooting
---

# Troubleshooting

## PM2 process not found

If running PM2 commands as a different user from the one that started the processes, prefix with `sudo -u <user>`:

```bash
sudo -u bot pm2 status
sudo -u bot pm2 restart all
```

## Commands not appearing in Discord

- Make sure `pnpm deploy:commands` completed without errors.
- Global commands (no `DISCORD_GUILD_ID` set) can take up to 60 minutes to propagate.
- Set `DISCORD_GUILD_ID` in `.env` during development for instant registration.

## Dashboard login fails

- Verify `DISCORD_REDIRECT_URI` in `.env` exactly matches the redirect URL in the Discord Developer Portal (including protocol and path).
- Check the API is running: `curl http://localhost:4000/health`
- Check API logs: `pm2 logs api`

## Database connection errors

- Confirm PostgreSQL is running: `sudo systemctl status postgresql`
- Test the connection: `psql "postgresql://arkenbot:password@localhost:5432/arkenbot" -c "SELECT 1;"`
- Ensure `DATABASE_URL` in `.env` has no surrounding quotes.

## Build permission errors in `.next`

The `.next` directory must be writable by the user running the build. If you switch users between builds:

```bash
sudo chown -R <build-user>:<group> packages/web/.next
```

## Redis connection errors

- Confirm Redis is running: `sudo systemctl status redis-server`
- Test: `redis-cli ping` — should return `PONG`.
- If your Redis instance has a password, set `REDIS_PASSWORD` in `.env`.

## Music commands not working

- Confirm Lavalink is running and reachable on the configured host/port.
- Check bot logs for Lavalink errors: `pm2 logs bot`
- If you see YouTube 403 errors, configure `YOUTUBE_COOKIES_FILE` (see [Deployment](deployment.md)).

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

# Grant staff dashboard access to a Discord user
pnpm grant-staff <discord-user-id>
```
