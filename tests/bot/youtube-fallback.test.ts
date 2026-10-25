import { describe, it, expect } from 'vitest';
import { uploadsPlaylistId, parsePlaylistVideoIds } from '../../packages/bot/src/modules/streamAlerts/YouTubeAlerts.js';

describe('uploadsPlaylistId', () => {
  it('maps a channel ID to its uploads playlist', () => {
    expect(uploadsPlaylistId('UCkVzUgzrRUXwis2SZQ-mSTQ')).toBe('UUkVzUgzrRUXwis2SZQ-mSTQ');
  });
});

describe('parsePlaylistVideoIds', () => {
  it('returns video IDs in the order the API lists them, skipping empty entries', () => {
    const ids = parsePlaylistVideoIds({
      items: [{ contentDetails: { videoId: 'aaaaaaaaaaa' } }, {}, { contentDetails: { videoId: 'bbbbbbbbbbb' } }],
    });
    expect(ids).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  });

  it('returns an empty list when the response has no items', () => {
    expect(parsePlaylistVideoIds({})).toEqual([]);
  });
});
