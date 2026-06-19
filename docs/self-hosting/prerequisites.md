---
id: self-hosting-prerequisites
sidebar_label: Prerequisites
---

# Prerequisites

Install the following on your Linux server before proceeding. Ubuntu 22.04 or later is recommended.

## Node.js 20+ and pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm

node --version   # v20.x.x or higher
pnpm --version   # 9.x.x or higher
```

## PostgreSQL 15+

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## Redis 7+

```bash
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

## PM2

```bash
npm install -g pm2
```

## Git

```bash
sudo apt-get install -y git
```

---

Next: [Discord Setup](discord-setup.md)
