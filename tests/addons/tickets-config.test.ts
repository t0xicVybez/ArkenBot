import { describe, it, expect } from 'vitest';
import type { AddonStorage } from '@arkenbot/addon-sdk';
import { updateConfig } from '../../addons/tickets/src/utils/storage.js';
import type { GuildTicketConfig } from '../../addons/tickets/src/types.js';

// Stands in for the bot's locked AddonStorage.mutate: every mutation runs
// against the latest stored value and after the previous one finishes.
function lockedStorage(initial: GuildTicketConfig) {
  let value: GuildTicketConfig | null = initial;
  let queue: Promise<unknown> = Promise.resolve();
  const storage = {
    mutate: <T>(_key: string, fn: (cur: T | null) => T | Promise<T>) => {
      const run = queue.then(async () => {
        const next = await fn(value as unknown as T | null);
        value = next as unknown as GuildTicketConfig;
        return next;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  } as unknown as AddonStorage;
  return { storage, current: () => value };
}

describe('updateConfig', () => {
  it('keeps a dashboard change when a later update was built from an older copy', async () => {
    const { storage, current } = lockedStorage({ blacklistedUsers: [], roundRobinIndex: 0 });

    // Ticket opened: its copy was read before the dashboard change below.
    const staleCopy = { ...current()! };
    await updateConfig(storage, 'g1', (cfg) => { cfg.autoAssign = false; });
    await updateConfig(storage, 'g1', (cfg) => { cfg.roundRobinIndex = staleCopy.roundRobinIndex + 1; });

    expect(current()?.autoAssign).toBe(false);
    expect(current()?.roundRobinIndex).toBe(1);
  });

  it('advances the round-robin index once per concurrent pick', async () => {
    const { storage, current } = lockedStorage({ blacklistedUsers: [], roundRobinIndex: 0 });
    await Promise.all([
      updateConfig(storage, 'g1', (cfg) => { cfg.roundRobinIndex = (cfg.roundRobinIndex ?? 0) + 1; }),
      updateConfig(storage, 'g1', (cfg) => { cfg.roundRobinIndex = (cfg.roundRobinIndex ?? 0) + 1; }),
    ]);
    expect(current()?.roundRobinIndex).toBe(2);
  });

  it('starts from an empty config when none is stored yet', async () => {
    const { storage, current } = lockedStorage(undefined as unknown as GuildTicketConfig);
    await updateConfig(storage, 'g1', (cfg) => { cfg.transcriptChannelId = 'c9'; });
    expect(current()).toEqual({ blacklistedUsers: [], transcriptChannelId: 'c9' });
  });
});
