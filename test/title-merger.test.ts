import { describe, it, expect } from 'vitest';
import { normalizeTitle, mergeGames, sortGames, filterGames } from '../lib/utils/title-merger';
import type { Game } from '../lib/types';

describe('Title Merger', () => {
  describe('normalizeTitle', () => {
    it('should convert to lowercase', () => {
      expect(normalizeTitle('Halo Infinite')).toBe('halo infinite');
    });

    it('should remove special characters', () => {
      expect(normalizeTitle('Halo®: Infinite™')).toBe('halo infinite');
    });

    it('should normalize colons and apostrophes', () => {
      expect(normalizeTitle("Assassin's Creed: Origins")).toBe('assassins creed origins');
    });

    it('should replace & with and', () => {
      expect(normalizeTitle('Banjo & Kazooie')).toBe('banjo and kazooie');
    });

    it('should normalize multiple spaces', () => {
      expect(normalizeTitle('Game   with    spaces')).toBe('game with spaces');
    });

    it('should handle complex titles', () => {
      expect(normalizeTitle("The Elder Scrolls® V: Skyrim™ - Special Edition")).toBe(
        'elder scrolls v skyrim special edition'
      );
    });

    it('should remove leading "the"', () => {
      expect(normalizeTitle('The Witcher 3')).toBe('witcher 3');
      expect(normalizeTitle('The Last of Us')).toBe('last of us');
    });

    // Call of Duty normalization tests
    it('should merge COD: Black Ops variations', () => {
      expect(normalizeTitle('Call of Duty®: Black Ops')).toBe('call of duty black ops');
      expect(normalizeTitle('Call of Duty: Black Ops')).toBe('call of duty black ops');
      expect(normalizeTitle('COD: Black Ops')).toBe('call of duty black ops');
    });

    it('should merge COD: Black Ops II variations', () => {
      expect(normalizeTitle('Call of Duty®: Black Ops II')).toBe('call of duty black ops 2');
      expect(normalizeTitle('COD: Black Ops II')).toBe('call of duty black ops 2');
      expect(normalizeTitle('COD: Black Ops 2')).toBe('call of duty black ops 2');
    });

    it('should merge COD: Black Ops III variations', () => {
      expect(normalizeTitle('Call of Duty®: Black Ops III')).toBe('call of duty black ops 3');
      expect(normalizeTitle('Call of Duty: Black Ops III')).toBe('call of duty black ops 3');
      expect(normalizeTitle('COD: Black Ops III')).toBe('call of duty black ops 3');
      expect(normalizeTitle('COD: Black Ops 3')).toBe('call of duty black ops 3');
    });

    it('should merge COD: Advanced Warfare variations', () => {
      expect(normalizeTitle('Call of Duty®: Advanced Warfare')).toBe('call of duty advanced warfare');
      expect(normalizeTitle('COD: Advanced Warfare')).toBe('call of duty advanced warfare');
    });

    it('should merge COD: World at War variations', () => {
      expect(normalizeTitle('Call of Duty®: WaW')).toBe('call of duty world at war');
      expect(normalizeTitle('Call of Duty®: World at War')).toBe('call of duty world at war');
      expect(normalizeTitle('COD: World at War')).toBe('call of duty world at war');
    });

    it('should distinguish MW 2007 from MW 2019', () => {
      expect(normalizeTitle('Modern Warfare®')).toBe('call of duty 4 modern warfare'); // 360 back-compat
      // "Call of Duty: Modern Warfare" is the 2019 reboot (e.g. SHRAPNELINDABUT titleId 1787008472, played 2021)
      expect(normalizeTitle('Call of Duty®: Modern Warfare®')).toBe('call of duty modern warfare 2019');
      expect(normalizeTitle('Call of Duty®: Modern Warfare® (2019)')).toBe('call of duty modern warfare 2019');
    });

    it('should distinguish MW2 2009 from MW2 2022', () => {
      expect(normalizeTitle('Modern Warfare® 2')).toBe('call of duty modern warfare 2 2009'); // 360 back-compat
      expect(normalizeTitle('Call of Duty®: Modern Warfare® II')).toBe('call of duty modern warfare 2 2022');
    });

    it('should distinguish MW3 2011 from MW3 2023', () => {
      expect(normalizeTitle('Modern Warfare® 3')).toBe('call of duty modern warfare 3 2011'); // 360 back-compat
      expect(normalizeTitle('Call of Duty®: Modern Warfare® III')).toBe('call of duty modern warfare 3 2023');
    });

    it('should identify COD HQ launcher', () => {
      expect(normalizeTitle('Call of Duty®')).toBe('call of duty hq launcher'); // Steam appid 1938090
    });

    // GTA aliases
    it('should merge GTA V variations', () => {
      expect(normalizeTitle('GTA V')).toBe('grand theft auto 5');
      expect(normalizeTitle('Grand Theft Auto V')).toBe('grand theft auto 5');
    });

    // Counter-Strike aliases
    it('should merge Counter-Strike GO variations', () => {
      expect(normalizeTitle('Counter-Strike: GO')).toBe('counter strike global offensive');
      expect(normalizeTitle('Counter-Strike: Global Offensive')).toBe('counter strike global offensive');
    });
  });

  describe('mergeGames', () => {
    it('should merge games with identical normalized titles', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Halo Infinite',
          platform: 'xbox',
          playtimeMinutes: 100,
          lastPlayedAt: new Date('2023-01-01'),
          achievementProgress: { earned: 10, total: 50 },
        },
        {
          id: '2',
          title: 'Halo Infinite',
          platform: 'steam',
          playtimeMinutes: 50,
          lastPlayedAt: new Date('2023-01-02'),
          achievementProgress: { earned: 5, total: 50 },
        },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(1);
      expect(merged[0].games).toHaveLength(2);
      expect(merged[0].totalPlaytimeMinutes).toBe(150);
      expect(merged[0].achievementProgress.earned).toBe(15);
      expect(merged[0].achievementProgress.total).toBe(100);
    });

    it('should merge COD: Black Ops across accounts', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Call of Duty®: Black Ops',
          platform: 'xbox',
          accountId: 'SHRAPNELINDABUT',
          playtimeMinutes: 300,
          achievementProgress: { earned: 20, total: 50 },
        },
        {
          id: '2',
          title: 'Call of Duty®: Black Ops',
          platform: 'xbox',
          accountId: 'XxMCLuBTubExX',
          playtimeMinutes: 150,
          achievementProgress: { earned: 10, total: 50 },
        },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(1);
      expect(merged[0].normalizedTitle).toBe('call of duty black ops');
      expect(merged[0].games).toHaveLength(2);
      expect(merged[0].totalPlaytimeMinutes).toBe(450);
      expect(merged[0].achievementProgress.earned).toBe(30);
      expect(merged[0].achievementProgress.total).toBe(100);
    });

    it('should merge COD: Black Ops with different title formats', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Call of Duty®: Black Ops',
          platform: 'xbox',
          playtimeMinutes: 300,
        },
        {
          id: '2',
          title: 'COD: Black Ops',
          platform: 'steam',
          playtimeMinutes: 150,
        },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(1);
      expect(merged[0].normalizedTitle).toBe('call of duty black ops');
      expect(merged[0].totalPlaytimeMinutes).toBe(450);
    });

    it('should merge COD: Advanced Warfare variations', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Call of Duty®: Advanced Warfare',
          platform: 'xbox',
          playtimeMinutes: 200,
        },
        {
          id: '2',
          title: 'COD: Advanced Warfare',
          platform: 'xbox',
          accountId: 'sameAccount',
          playtimeMinutes: 100,
        },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(1);
      expect(merged[0].normalizedTitle).toBe('call of duty advanced warfare');
      expect(merged[0].totalPlaytimeMinutes).toBe(300);
    });

    it('should keep MW (2007), MW (2019), MW2 (2009), MW2 (2022) separate', () => {
      const games: Game[] = [
        { id: '1', title: 'Modern Warfare®', platform: 'xbox' }, // MW 2007
        { id: '2', title: 'Call of Duty®: Modern Warfare® (2019)', platform: 'xbox' },
        { id: '3', title: 'Modern Warfare® 2', platform: 'xbox' }, // MW2 2009
        { id: '4', title: 'Call of Duty®: Modern Warfare® II', platform: 'xbox' }, // MW2 2022
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(4);
      expect(merged.map(g => g.normalizedTitle).sort()).toEqual([
        'call of duty 4 modern warfare',
        'call of duty modern warfare 2 2009',
        'call of duty modern warfare 2 2022',
        'call of duty modern warfare 2019',
      ]);
    });

    it('should identify COD HQ launcher with note', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Call of Duty®', // Steam appid 1938090
          platform: 'steam',
          playtimeMinutes: 6674,
        },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(1);
      expect(merged[0].normalizedTitle).toBe('call of duty hq launcher');
      expect(merged[0].note).toBeDefined();
      expect(merged[0].note).toContain('Launcher');
    });

    it('should not merge COD HQ with Black Ops 6', () => {
      const games: Game[] = [
        { id: '1', title: 'Call of Duty®', platform: 'steam', playtimeMinutes: 6674 }, // HQ
        { id: '2', title: 'Call of Duty®: Black Ops 6', platform: 'steam', playtimeMinutes: 0 },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(2);
    });

    it('should use most recent lastPlayedAt', () => {
      const games: Game[] = [
        {
          id: '1',
          title: 'Game',
          platform: 'xbox',
          lastPlayedAt: new Date('2023-01-01'),
        },
        {
          id: '2',
          title: 'Game',
          platform: 'steam',
          lastPlayedAt: new Date('2023-01-05'),
        },
      ];

      const merged = mergeGames(games);
      expect(merged[0].lastPlayedAt.toISOString()).toBe(new Date('2023-01-05').toISOString());
    });

    it('should keep games separate if titles differ', () => {
      const games: Game[] = [
        { id: '1', title: 'Game A', platform: 'xbox' },
        { id: '2', title: 'Game B', platform: 'steam' },
      ];

      const merged = mergeGames(games);
      expect(merged).toHaveLength(2);
    });

    it('should use first available cover URL', () => {
      const games: Game[] = [
        { id: '1', title: 'Game', platform: 'xbox', coverUrl: undefined },
        { id: '2', title: 'Game', platform: 'steam', coverUrl: 'http://cover.jpg' },
      ];

      const merged = mergeGames(games);
      expect(merged[0].coverUrl).toBe('http://cover.jpg');
    });
  });

  describe('sortGames', () => {
    const games = mergeGames([
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
        achievementProgress: { earned: 50, total: 50 },
      },
    ]);

    it('should sort by lastPlayed', () => {
      const sorted = sortGames(games, 'lastPlayed');
      expect(sorted[0].games[0].title).toBe('Game B');
    });

    it('should sort by playtime', () => {
      const sorted = sortGames(games, 'playtime');
      expect(sorted[0].games[0].title).toBe('Game B');
    });

    it('should sort by completion', () => {
      const sorted = sortGames(games, 'completion');
      expect(sorted[0].games[0].title).toBe('Game B');
    });

    it('should sort by title', () => {
      const sorted = sortGames(games, 'title');
      expect(sorted[0].games[0].title).toBe('Game A');
    });
  });

  describe('filterGames', () => {
    const games = mergeGames([
      { id: '1', title: 'Game A', platform: 'xbox' },
      { id: '2', title: 'Game B', platform: 'steam' },
      { id: '3', title: 'Game C', platform: 'xbox' },
    ]);

    it('should return all games with "all" filter', () => {
      const filtered = filterGames(games, 'all');
      expect(filtered).toHaveLength(3);
    });

    it('should filter by xbox platform', () => {
      const filtered = filterGames(games, 'xbox');
      expect(filtered).toHaveLength(2);
    });

    it('should filter by steam platform', () => {
      const filtered = filterGames(games, 'steam');
      expect(filtered).toHaveLength(1);
    });
  });
});

describe('normalizeTitle aliases for Xbox 360 short names', () => {
  it('merges abbreviated 360 titles with their full names', () => {
    expect(normalizeTitle('COD: Black Ops III')).toBe(normalizeTitle('Call of Duty: Black Ops III'));
    expect(normalizeTitle('COD: Advanced Warfare')).toBe(normalizeTitle('Call of Duty®: Advanced Warfare'));
    expect(normalizeTitle('GTA V')).toBe(normalizeTitle('Grand Theft Auto V'));
    expect(normalizeTitle('Counter-Strike: GO')).toBe(normalizeTitle('Counter-Strike: Global Offensive'));
    expect(normalizeTitle('Modern Warfare® 3')).toBe(normalizeTitle('Call of Duty: Modern Warfare 3'));
    expect(normalizeTitle('Call of Duty®: WaW')).toBe(normalizeTitle('Call of Duty: World at War'));
  });

  it('keeps the Modern Warfare reboots separate from the 2007-2011 games', () => {
    expect(normalizeTitle('Modern Warfare®')).not.toBe(normalizeTitle('Call of Duty: Modern Warfare'));
    expect(normalizeTitle('Modern Warfare® 2')).not.toBe(normalizeTitle('Call of Duty®: Modern Warfare® II'));
  });
});
