import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache } from '../lib/cache';
import { reviveGameArrayDates } from '../lib/utils/date-reviver';
import { sortGames, mergeGames } from '../lib/utils/title-merger';
import type { Game } from '../lib/types';

describe('Cache Date Serialization', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  it('should round-trip games with dates through cache and sort correctly', async () => {
    const games: Game[] = [
      {
        id: '1',
        title: 'Game A',
        platform: 'xbox',
        playtimeMinutes: 100,
        lastPlayedAt: new Date('2023-01-01'),
        achievementProgress: { earned: 10, total: 50 },
      },
      {
        id: '2',
        title: 'Game B',
        platform: 'steam',
        playtimeMinutes: 200,
        lastPlayedAt: new Date('2023-01-05'),
        achievementProgress: { earned: 25, total: 50 },
      },
    ];

    await cache.set('test:games', games, 3600);

    const cached = await cache.get<Game[]>('test:games');
    expect(cached).not.toBeNull();

    const revived = reviveGameArrayDates(cached!);

    expect(revived[0].lastPlayedAt).toBeInstanceOf(Date);
    expect(revived[1].lastPlayedAt).toBeInstanceOf(Date);

    const merged = mergeGames(revived);
    const sorted = sortGames(merged, 'lastPlayed');

    expect(sorted[0].games[0].title).toBe('Game B');
    expect(sorted[0].lastPlayedAt.getTime()).toBeGreaterThan(sorted[1].lastPlayedAt.getTime());
  });

  it('should handle games without dates', async () => {
    const games: Game[] = [
      {
        id: '1',
        title: 'Game Without Date',
        platform: 'xbox',
      },
    ];

    await cache.set('test:games2', games, 3600);
    const cached = await cache.get<Game[]>('test:games2');
    const revived = reviveGameArrayDates(cached!);

    expect(revived[0].lastPlayedAt).toBeUndefined();
  });
});
