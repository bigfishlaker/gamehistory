import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Game } from '../lib/types';
import { mergeGames } from '../lib/utils/title-merger';
import { mergeAchievementProgress } from '../lib/utils/achievements';
import { isNonGame, filterNonGames } from '../lib/utils/non-game';
import { pickHeaderIdentity } from '../lib/utils/header-identity';
import { SteamAdapter } from '../lib/adapters/steam-adapter';

const g = (p: Partial<Game>): Game => ({ id: '1', title: 'X', platform: 'xbox', ...p });

describe('achievements: no fake 0/N', () => {
  it('Fortnite with 0/45 (Xbox) + 0/46 (PSN) + no data is unknown, not 0/91', () => {
    const [fn] = mergeGames([
      g({ id: '1820250788', title: 'Fortnite' }),
      g({ id: '267695549', title: 'Fortnite', achievementProgress: { earned: 0, total: 45 }, playtimeMinutes: 11930 }),
      g({ id: 'CUSA07022_00', platform: 'psn', title: 'Fortnite', achievementProgress: { earned: 0, total: 46 }, playtimeMinutes: 99066 }),
    ]);
    expect(fn.achievementProgress).toEqual({ earned: 0, total: 0 });
    expect(fn.totalPlaytimeMinutes).toBe(110996);
  });

  it('merges only accounts with real data', () => {
    expect(mergeAchievementProgress([
      { achievementProgress: { earned: 10, total: 50 } },
      { achievementProgress: { earned: 0, total: 50 } },
      { achievementProgress: undefined },
    ])).toEqual({ earned: 10, total: 50 });
    expect(mergeAchievementProgress([
      { achievementProgress: { earned: 10, total: 50 } },
      { achievementProgress: { earned: 5, total: 40 } },
    ])).toEqual({ earned: 15, total: 90 });
    // one real entry with an unknown total -> earned only
    expect(mergeAchievementProgress([
      { achievementProgress: { earned: 12, total: 0 } },
      { achievementProgress: { earned: 3, total: 20 } },
    ])).toEqual({ earned: 15, total: 0 });
    expect(mergeAchievementProgress([{ achievementProgress: { earned: 0, total: 30 } }])).toBeUndefined();
  });
});

describe('non-game apps are excluded', () => {
  it.each(['SHAREfactory™', 'EA Play Hub', 'Minecraft Launcher', 'Xbox App', 'Netflix', 'YouTube', 'Disney+', 'Spotify Music', 'Steamworks Common Redistributables', 'Xbox Insider Hub', 'Twitch'])('%s', t => {
    expect(isNonGame({ title: t })).toBe(true);
  });

  it.each(['JD Disney Party', 'Call of Duty®', 'Call of Duty HQ (MW2/MW3/BO6/Warzone)', 'Minecraft for Windows', 'Fortnite', 'Hub World Adventures', 'Max Payne 3', 'Forza Horizon 3'])('keeps game %s', t => {
    expect(isNonGame({ title: t })).toBe(false);
  });

  it('uses the platform category when present', () => {
    expect(isNonGame({ title: 'Some Service', category: 'ps4_videoservice_web_app' })).toBe(true);
    expect(isNonGame({ title: 'Some App', category: 'App' })).toBe(true);
    expect(isNonGame({ title: 'Some Game', category: 'ps4_game' })).toBe(false);
  });

  it('drops them from lists and totals', () => {
    const kept = filterNonGames([g({ title: 'SHAREfactory™', playtimeMinutes: 127 }), g({ title: 'Fortnite', playtimeMinutes: 10 })]);
    expect(kept.map(x => x.title)).toEqual(['Fortnite']);
  });
});

describe('Steam CoD HQ launcher is labelled, hours kept', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('renames appid 1938090 and keeps its playtime', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { game_count: 1, games: [{ appid: 1938090, name: 'Call of Duty®', playtime_forever: 6674 }] } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const r = await new SteamAdapter('k').getGameLibrary('76561198115251778');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data[0].title).toBe('Call of Duty HQ (MW2/MW3/BO6/Warzone)');
      expect(r.data[0].playtimeMinutes).toBe(6674);
      const [merged] = mergeGames(r.data);
      expect(merged.normalizedTitle).toBe('call of duty hq launcher');
      expect(merged.note).toMatch(/Launcher/);
    }
  });
});

describe('header identity follows toggles', () => {
  const profiles = [
    { platform: 'xbox' as const, id: '2533275006943389', displayName: 'SHRAPNELINDABUT', avatarUrl: 'a' },
    { platform: 'steam' as const, id: '76561199851755493', displayName: 'BOG WALKER', avatarUrl: 'b' },
  ];
  it('uses the first enabled account', () => {
    expect(pickHeaderIdentity(profiles, new Set(['xbox:2533275006943389']))).toMatchObject({ displayName: 'BOG WALKER', avatarUrl: 'b', platform: 'steam' });
    expect(pickHeaderIdentity(profiles, new Set())).toMatchObject({ displayName: 'SHRAPNELINDABUT', avatarUrl: 'a' });
  });
  it('a chosen picture wins', () => {
    expect(pickHeaderIdentity(profiles, new Set(['xbox:2533275006943389']), 'custom').avatarUrl).toBe('custom');
  });
});
