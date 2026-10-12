/**
 * Prisma handle for the Tickets addon's relational storage (P1.2). Addons don't
 * normally touch the DB directly, so the bot injects its PrismaClient into the
 * addon context at init and we stash it here. Tests set it directly.
 *
 * Typed minimally (only the models/ops the tickets repo uses) so this module
 * doesn't need to depend on the full generated client type.
 */

export interface TicketDb {
  addonTicket: {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    deleteMany(args: unknown): Promise<unknown>;
    count(args?: unknown): Promise<number>;
  };
  addonTicketMessage: {
    create(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    deleteMany(args: unknown): Promise<unknown>;
  };
}

let _db: TicketDb | null = null;

/** Called once at addon init (bot injects ctx.db), or directly in tests. */
export function setTicketDb(db: TicketDb): void {
  _db = db;
}

export function getTicketDb(): TicketDb {
  if (!_db) throw new Error('Ticket DB not initialised — setTicketDb() was never called.');
  return _db;
}

export function hasTicketDb(): boolean {
  return _db !== null;
}
