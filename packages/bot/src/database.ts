/**
 * Initialises the shared Prisma client and exports connection lifecycle helpers
 * used by the bot's startup and shutdown sequences.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

// Warn- and error-level Prisma events are forwarded to the application logger
// rather than written to stderr so they appear in structured log output.
const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn', (e) => logger.warn(e.message));
prisma.$on('error', (e) => logger.error(e.message));

export { prisma };

/** Opens the database connection pool. Must be called before any queries are made. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

/** Drains the connection pool and closes the database connection. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
