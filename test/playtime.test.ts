import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizePlaytime, formatHours } from '../lib/utils/playtime';
import { mergeGames, sortGames } from '../lib/utils/title-merger';
import { XboxAdapter } from '../lib/adapters/xbox-adapter';
import { SteamAdapter } from '../lib/adapters/steam-adapter';
import type { Game } from '../lib/types';

const games: Game[] = [
  { id: 'x1', title: 'Fortnite', platform: 'xbox', playtimeMinutes: 600 },
  { id: 'x2', title: 'Fortnite', platform: 'xbox', playtimeMinutes: 60 },
  { id: 's1', title: 'Fortnite®', platform: 'steam', playtimeMinutes: 120 },
  { id: 'x3', title: 'Rocket League', platform: 'xbox' },
  { id: 's2', title: 'Counter-Strike 2', platform: 'steam', playtimeMinutes: 900 },
  { id: 's3', title: 'Unplayed', platform: 'steam', playtimeMinutes: 0 },
];

describe('stacked playtime', () => {
  it('sums known playtime per platform and in total, counting unknowns separately', () => {
    const s = summarizePlaytime(games);
    expect(s.totalMinutes).toBe(1680);
    expect(s.byPlatform.xbox).toEqual({ minutes: 660, gamesWithData: 2, gamesUnknown: 1 });
    expect(s.byPlatform.steam).toEqual({ minutes: 1020, gamesWithData: 3, gamesUnknown: 0 });
  });

  it('ranks games by combined minutes with a per-platform breakdown', () => {
    const s = summarizePlaytime(games);
    expect(s.topCombined.map(e => e.normalizedTitle)).toEqual(['counter strike 2', 'fortnite']);
    expect(s.topCombined[1]).toMatchObject({ totalMinutes: 780, byPlatform: { xbox: 660, steam: 120 } });
  });

  it('keeps unknown playtime unknown (not 0) and sorts it last', () => {
    const merged = mergeGames(games);
    const rl = merged.find(g => g.normalizedTitle === 'rocket league')!;
    expect(rl.playtimeKnown).toBe(false);
    expect(rl.playtimeByPlatform).toEqual({});
    const unplayed = merged.find(g => g.normalizedTitle === 'unplayed')!;
    expect(unplayed.playtimeKnown).toBe(true);
    const sorted = sortGames(merged, 'playtime');
    expect(sorted[sorted.length - 1].normalizedTitle).toBe('rocket league');
  });

  it('formats hours', () => {
    expect(formatHours(40794)).toBe('679.9h');
    expect(formatHours(90)).toBe('1.5h');
  });
});

describe('XboxAdapter.getTitlePlaytimes', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('POSTs one batched MinutesPlayed request and skips stats without a value', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => null, // No rate limit headers in mock
      },
      json: async () => ({
        code: 200,
        content: {
          groups: [],
          statlistscollection: [{
            arrangebyfieldid: '1',
            stats: [
              { titleid: '896928775', name: 'MinutesPlayed', type: 'Integer', value: '2093' },
              { titleid: '1794566092', name: 'MinutesPlayed', type: 'Integer' },
            ],
          }],
        },
      }),
    });
    const adapter = new XboxAdapter('k');
    const result = await adapter.getTitlePlaytimes('1', ['896928775', '1794566092', '1820250788']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.xbl.io/v2/player/stats');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      xuids: ['1'],
      stats: [
        { name: 'MinutesPlayed', titleId: '896928775' },
        { name: 'MinutesPlayed', titleId: '1794566092' },
        { name: 'MinutesPlayed', titleId: '1820250788' },
      ],
    });
    expect(result).toEqual({ success: true, data: { '896928775': 2093 } });
  });
});

describe('SteamAdapter.getGameAchievements on a private profile', () => {
  it('returns PRIVATE_PROFILE instead of fabricating an all-locked list', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ game: { availableGameStats: { achievements: [{ name: 'A', displayName: 'A' }] } } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"playerstats":{"error":"Profile is not public","success":false}}',
      });
    global.fetch = mockFetch as unknown as typeof fetch;
    const result = await new SteamAdapter('k').getGameAchievements('76561197960287930', '440');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PRIVATE_PROFILE');
  });
});

describe('XboxAdapter.getGameAchievements for Xbox 360 titles', () => {
  it('falls back to the legacy x360 endpoint when the modern endpoint returns nothing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        json: async () => ({ code: 200, content: { achievements: [], pagingInfo: { totalRecords: 0 } } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        json: async () => ({ code: 200, content: { achievements: [
          { id: 38, name: 'Big Leagues', description: 'Win 5 League Play games.', unlocked: true, timeUnlocked: '2013-06-04T23:40:52.16Z', rarity: { currentPercentage: 8.31 } },
        ] } }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;
    const result = await new XboxAdapter('k').getGameAchievements('2533274796433767', '1096157379');
    expect(mockFetch.mock.calls[1][0]).toBe('https://api.xbl.io/v2/achievements/x360/2533274796433767/title/1096157379');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: '38', name: 'Big Leagues', unlocked: true, rarity: 8.31 });
      expect(result.data[0].unlockedAt?.toISOString()).toBe('2013-06-04T23:40:52.160Z');
    }
  });
});
