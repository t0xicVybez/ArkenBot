/**
 * db helpers for the tickets addon.
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
