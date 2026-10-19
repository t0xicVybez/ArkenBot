/**
 * Pure auto-assign selection logic for the tickets addon, kept separate
 * from handlers/open.ts (which deals with real Discord guild/role objects)
 * so the actual "who gets this ticket" decision is unit-testable.
 */

export interface AssignCandidate {
  id: string;
}

export interface AssignResult<T> {
  assignee: T;
  nextIndex: number;
}

/**
 * Picks whoever currently has the fewest open tickets. Ties (including the
 * common case of everyone at 0) are broken by round-robin order, so a dead
 * heat doesn't always favor the same person — `roundRobinIndex` is the
 * value from last time, and `nextIndex` is what to persist for next time.
 */
export function pickLeastLoadedAssignee<T extends AssignCandidate>(
  candidates: T[],
  loadByUserId: Map<string, number>,
  roundRobinIndex: number,
): AssignResult<T> | null {
  if (candidates.length === 0) return null;

  const minLoad = Math.min(...candidates.map((c) => loadByUserId.get(c.id) ?? 0));
  const leastLoaded = candidates.filter((c) => (loadByUserId.get(c.id) ?? 0) === minLoad);

  const idx = ((roundRobinIndex % leastLoaded.length) + leastLoaded.length) % leastLoaded.length;
  return { assignee: leastLoaded[idx], nextIndex: (idx + 1) % leastLoaded.length };
}
