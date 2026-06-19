---
id: self-hosting-database
sidebar_label: Database
---

# Database Setup

## Create the Database and User

```bash
sudo -u postgres psql
```

```sql
CREATE USER arkenbot WITH PASSWORD 'your_secure_password';
CREATE DATABASE arkenbot OWNER arkenbot;
GRANT ALL PRIVILEGES ON DATABASE arkenbot TO arkenbot;
\q
```

Update `DATABASE_URL` in your `.env`:

```
DATABASE_URL=postgresql://arkenbot:your_secure_password@localhost:5432/arkenbot
```

## Apply the Schema

```bash
pnpm db:push
```

This creates all tables. Re-run it any time the schema changes after pulling an update.

For a production migration workflow (preserves migration history):

```bash
pnpm db:migrate    # applies pending migrations
pnpm db:generate   # regenerates the Prisma client
```

---

Next: [Deployment](deployment.md)
