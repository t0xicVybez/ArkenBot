---
id: self-hosting-deployment
sidebar_label: Deployment
---

# Deployment

## Build and Start

```bash
# Install all workspace dependencies
pnpm install

# Build everything in dependency order
pnpm build

# Deploy slash commands to Discord (run once after first setup and after adding commands)
pnpm deploy:commands

# Start all three services with PM2
pm2 start ecosystem.config.cjs

# Save the process list so PM2 restores it after a reboot
pm2 save

# Configure PM2 to start on boot (follow the printed instruction)
pm2 startup
```

## PM2 Reference

```bash
pm2 status              # check all processes
pm2 logs                # live logs for all services
pm2 logs bot            # logs for a single service
pm2 restart all         # restart everything
pm2 restart bot         # restart one service
```

## Updating

```bash
git pull
pnpm install
pnpm db:push            # safe to run even when nothing changed
pnpm build
pm2 restart all
```

## Nginx Reverse Proxy (Optional)

If you want the dashboard and API on standard ports behind a domain, set up Nginx:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/arkenbot`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/arkenbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# HTTPS with Let's Encrypt
sudo certbot --nginx -d yourdomain.com
```

After obtaining a certificate, update `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `CORS_ORIGIN`, and `WEB_URL` in `.env` to use `https://` and `wss://`, then rebuild the web package:

```bash
pnpm --filter @arkenbot/web build
pm2 restart web
```

## Lavalink — Music Support (Optional)

Music commands require a running [Lavalink](https://lavalink.dev) server.

1. Download the latest `Lavalink.jar` from the [Lavalink releases](https://github.com/lavalink-devs/Lavalink/releases).
2. Create an `application.yml` configuration file (see the Lavalink docs for a template).
3. Start Lavalink: `java -jar Lavalink.jar`
4. Add to your `.env`:

```
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false
```

**YouTube playback:** If music fails with 403 errors, export cookies from your browser using the "Get cookies.txt LOCALLY" Chrome extension while logged into YouTube, and set:

```
YOUTUBE_COOKIES_FILE=/path/to/youtube-cookies.txt
```
