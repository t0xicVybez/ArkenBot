/**
 * Compare-and-set write for one ticket row. The dashboard reads a ticket,
 * the user edits it, and the write only lands if the row still has the
 * `updatedAt` it was read with. Otherwise another writer (the bot, or a
 * second dashboard tab) changed it in between, and the caller reports a
 * conflict instead of silently reverting that change.
 */
export type TicketRowUpdater = (
  where: { id: string; updatedAt: Date },
  data: Record<string, unknown>,
) => Promise<number>;

export async function writeTicketIfUnchanged(
  updateRow: TicketRowUpdater,
  id: string,
  expectedUpdatedAt: Date,
  data: Record<string, unknown>,
): Promise<boolean> {
  const count = await updateRow({ id, updatedAt: expectedUpdatedAt }, data);
  return count === 1;
}
