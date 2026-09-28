import { describe, it, expect } from 'vitest';
import { mergeGames, sortGames } from '../lib/utils/title-merger';
import { summarizePlaytime } from '../lib/utils/playtime';
import type { Game } from '../lib/types';

describe('Account Toggle Filtering', () => {
  const testGames: Game[] = [
    {
      id: '1',
      title: 'Halo Infinite',
      platform: 'xbox',
      accountId: 'player1',
      playtimeMinutes: 600,
      achievementProgress: { earned: 10, total: 50 },
    },
    {
      id: '2',
      title: 'Halo Infinite',
      platform: 'xbox',
      accountId: 'player2',
      playtimeMinutes: 300,
      achievementProgress: { earned: 5, total: 50 },
    },
    {
      id: '3',
      title: 'Fortnite',
      platform: 'steam',
      accountId: 'steamplayer1',
      playtimeMinutes: 1200,
      achievementProgress: { earned: 20, total: 100 },
    },
  ];

  it('should filter games by enabled accounts', () => {
    const disabledAccounts = new Set(['xbox:player2']);
    const enabledGames = testGames.filter(g => {
      const accountKey = `${g.platform}:${g.accountId}`;
      return !disabledAccounts.has(accountKey);
    });

    expect(enabledGames).toHaveLength(2);
    expect(enabledGames.some(g => g.accountId === 'player2')).toBe(false);
  });

  it('should recalculate merged game stats when accounts are toggled', () => {
    // All accounts enabled
    const allEnabled = mergeGames(testGames);
    const haloAll = allEnabled.find(g => g.normalizedTitle === 'halo infinite');
    expect(haloAll?.totalPlaytimeMinutes).toBe(900);
    expect(haloAll?.achievementProgress.earned).toBe(15);

    // One account disabled
    const disabledAccounts = new Set(['xbox:player2']);
    const filteredGames = testGames.filter(g => {
      const accountKey = `${g.platform}:${g.accountId}`;
      return !disabledAccounts.has(accountKey);
    });
    const oneDisabled = mergeGames(filteredGames);
    const haloFiltered = oneDisabled.find(g => g.normalizedTitle === 'halo infinite');
    expect(haloFiltered?.totalPlaytimeMinutes).toBe(600);
    expect(haloFiltered?.achievementProgress.earned).toBe(10);
  });

  it('should recalculate playtime summary when accounts are toggled', () => {
    const allSummary = summarizePlaytime(testGames);
    expect(allSummary.totalMinutes).toBe(2100);
    expect(allSummary.byPlatform.xbox?.minutes).toBe(900);

    const disabledAccounts = new Set(['xbox:player2']);
    const filteredGames = testGames.filter(g => {
      const accountKey = `${g.platform}:${g.accountId}`;
      return !disabledAccounts.has(accountKey);
    });
    const filteredSummary = summarizePlaytime(filteredGames);
    expect(filteredSummary.totalMinutes).toBe(1800);
    expect(filteredSummary.byPlatform.xbox?.minutes).toBe(600);
  });
});

describe('Top 6 URL Encoding', () => {
  it('should encode top6 selection as platform-id pairs', () => {
    const selectedGames = [
      { platform: 'steam', id: '730' },
      { platform: 'xbox', id: '896928775' },
      { platform: 'steam', id: '570' },
    ];

    const encoded = selectedGames.map(g => `${g.platform}-${g.id}`).join(',');
    expect(encoded).toBe('steam-730,xbox-896928775,steam-570');
  });

  it('should decode top6 URL parameter back to game keys', () => {
    const urlParam = 'steam-730,xbox-896928775,steam-570';
    const decoded = urlParam.split(',').map(key => {
      const [platform, id] = key.split('-');
      return { platform, id };
    });

    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toEqual({ platform: 'steam', id: '730' });
    expect(decoded[1]).toEqual({ platform: 'xbox', id: '896928775' });
    expect(decoded[2]).toEqual({ platform: 'steam', id: '570' });
  });

  it('should handle empty top6 parameter', () => {
    const urlParam = '';
    const decoded = urlParam.split(',').filter(Boolean);
    expect(decoded).toHaveLength(0);
  });

  it('should parse top6 parameter and find matching games', () => {
    const testGames: Game[] = [
      { id: '730', title: 'Counter-Strike 2', platform: 'steam', playtimeMinutes: 1000 },
      { id: '896928775', title: 'Halo Infinite', platform: 'xbox', playtimeMinutes: 500 },
      { id: '570', title: 'Dota 2', platform: 'steam', playtimeMinutes: 2000 },
    ];

    const mergedGames = mergeGames(testGames);
    const urlParam = 'steam-730,xbox-896928775';
    const gameKeys = urlParam.split(',');

    const selectedGames = gameKeys.map(key => {
      const [platform, id] = key.split('-');
      return mergedGames.find(mg => 
        mg.games.some(g => g.platform === platform && g.id === id)
      );
    }).filter(Boolean);

    expect(selectedGames).toHaveLength(2);
    expect(selectedGames[0]?.games[0].title).toBe('Counter-Strike 2');
    expect(selectedGames[1]?.games[0].title).toBe('Halo Infinite');
  });
});

describe('Top 6 with Account Toggles', () => {
  it('should detect when all accounts for a game are disabled', () => {
    const game = {
      games: [
        { platform: 'xbox' as const, accountId: 'player1', id: '1', title: 'Test' },
        { platform: 'xbox' as const, accountId: 'player2', id: '1', title: 'Test' },
      ],
    };

    const disabledAccounts = new Set(['xbox:player1', 'xbox:player2']);
    const allDisabled = game.games.every(g => {
      const accountKey = `${g.platform}:${g.accountId}`;
      return disabledAccounts.has(accountKey);
    });

    expect(allDisabled).toBe(true);
  });

  it('should recalculate game stats for enabled accounts only', () => {
    const gameInstances = [
      { platform: 'xbox' as const, accountId: 'player1', playtimeMinutes: 600, achievementProgress: { earned: 10, total: 50 } },
      { platform: 'xbox' as const, accountId: 'player2', playtimeMinutes: 300, achievementProgress: { earned: 5, total: 50 } },
    ];

    const disabledAccounts = new Set(['xbox:player2']);
    const enabledGames = gameInstances.filter(g => {
      const accountKey = `${g.platform}:${g.accountId}`;
      return !disabledAccounts.has(accountKey);
    });

    const totalPlaytime = enabledGames.reduce((sum, g) => sum + (g.playtimeMinutes || 0), 0);
    const totalAchievements = {
      earned: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.earned || 0), 0),
      total: enabledGames.reduce((sum, g) => sum + (g.achievementProgress?.total || 0), 0),
    };

    expect(totalPlaytime).toBe(600);
    expect(totalAchievements.earned).toBe(10);
    expect(totalAchievements.total).toBe(50);
  });
});
