/**
 * DB-layer health probe for the Prisma auto-rollback monitor.
 * Reads the API's /public/status (which runs `prisma.$queryRaw SELECT 1` and
 * reads the bot heartbeat). Exit 0 when the DB layer AND bot are healthy,
 * else exit 1. This catches a Prisma-client/adapter failure in api or bot.
 */
const URL = process.env.STATUS_URL || 'http://localhost:4000/public/status';
try {
  const res = await fetch(URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) { console.error(`status HTTP ${res.status}`); process.exit(1); }
  const j = await res.json();
  const db = j?.data?.database?.online === true;
  const bot = j?.data?.bot?.online === true;
  if (db && bot) { process.exit(0); }
  console.error(`unhealthy: database.online=${db} bot.online=${bot}`);
  process.exit(1);
} catch (e) {
  console.error(`probe error: ${e.message}`);
  process.exit(1);
}
