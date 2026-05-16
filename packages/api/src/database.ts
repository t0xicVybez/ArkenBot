/**
 * Prisma client singleton and connection lifecycle helpers used throughout the API.
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Opens the database connection. Called once at server startup. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

/** Closes the database connection. Called during graceful shutdown. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
