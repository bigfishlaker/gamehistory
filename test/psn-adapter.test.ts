import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PSNAdapter } from '../lib/adapters/psn-adapter';
import type { AuthTokensResponse } from 'psn-api';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock the psn-api module
vi.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: vi.fn(),
  exchangeAccessCodeForAuthTokens: vi.fn(),
  exchangeRefreshTokenForAuthTokens: vi.fn(),
  makeUniversalSearch: vi.fn(),
  getProfileFromUserName: vi.fn(),
  getUserTitles: vi.fn(),
  getUserPlayedGames: vi.fn(),
  getTitleTrophies: vi.fn(),
  getUserTrophiesEarnedForTitle: vi.fn(),
}));

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  makeUniversalSearch,
  getProfileFromUserName,
  getUserTitles,
  getUserPlayedGames,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from 'psn-api';

const mockExchangeNpssoForAccessCode = vi.mocked(exchangeNpssoForAccessCode);
const mockExchangeAccessCodeForAuthTokens = vi.mocked(exchangeAccessCodeForAuthTokens);
const mockMakeUniversalSearch = vi.mocked(makeUniversalSearch);
const mockGetProfileFromUserName = vi.mocked(getProfileFromUserName);
const mockGetUserTitles = vi.mocked(getUserTitles);
const mockGetUserPlayedGames = vi.mocked(getUserPlayedGames);
const mockGetTitleTrophies = vi.mocked(getTitleTrophies);
const mockGetUserTrophiesEarnedForTitle = vi.mocked(getUserTrophiesEarnedForTitle);

describe('PSNAdapter', () => {
  let adapter: PSNAdapter;
  const testNpsso = 'test-npsso-token-64-characters-long-000000000000000000000000000';
  
  const mockTokenResponse: AuthTokensResponse = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    scope: '',
    idToken: 'mock-id-token',
    refreshTokenExpiresIn: 86400,
  };

  beforeEach(() => {
    adapter = new PSNAdapter(testNpsso);
    vi.clearAllMocks();
    
    // Default mock for auth flow
    mockExchangeNpssoForAccessCode.mockResolvedValue('mock-access-code');
    mockExchangeAccessCodeForAuthTokens.mockResolvedValue(mockTokenResponse);
  });

  describe('authentication', () => {
    it('should authenticate with NPSSO token', async () => {
      mockMakeUniversalSearch.mockResolvedValue({
        domainResponses: [{
          results: [{
            socialMetadata: {
              accountId: 'test-account-id',
              onlineId: 'TestPlayer',
              avatarUrl: 'https://image.api.playstation.com/avatar.png',
            },
          }],
        }],
      } as any);

      await adapter.resolvePlayer('TestPlayer');

      expect(mockExchangeNpssoForAccessCode).toHaveBeenCalledWith(testNpsso);
      expect(mockExchangeAccessCodeForAuthTokens).toHaveBeenCalledWith('mock-access-code');
    });

    it('should handle authentication failures', async () => {
      // Use a different NPSSO to avoid cached tokens from other tests
      const failAdapter = new PSNAdapter('different-npsso-token');
      
      vi.clearAllMocks();
      mockExchangeNpssoForAccessCode.mockRejectedValue(new Error('Invalid NPSSO'));

      const result = await failAdapter.resolvePlayer('TestPlayer');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_FAILED');
        expect(result.error.message).toContain('NPSSO token may be invalid or expired');
      }
    });
  });

  describe('resolvePlayer', () => {
    it('should resolve a player with universal search', async () => {
      mockMakeUniversalSearch.mockResolvedValue({
        domainResponses: [{
          results: [{
            socialMetadata: {
              accountId: 'test-account-id',
              onlineId: 'TestPlayer',
              avatarUrl: 'https://image.api.playstation.com/avatar.png',
            },
          }],
        }],
      } as any);

      const result = await adapter.resolvePlayer('TestPlayer');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('test-account-id');
        expect(result.data.displayName).toBe('TestPlayer');
        expect(result.data.avatarUrl).toBe('https://image.api.playstation.com/avatar.png');
        expect(result.data.platform).toBe('psn');
      }
    });

    it('should fallback to getProfileFromUserName', async () => {
      mockMakeUniversalSearch.mockResolvedValue({
        domainResponses: [{
          results: [],
        }],
      } as any);

      mockGetProfileFromUserName.mockResolvedValue({
        profile: {
          accountId: 'fallback-id',
          onlineId: 'TestPlayer',
          avatarUrls: [{
            avatarUrl: 'https://image.api.playstation.com/fallback.png',
          }],
        },
      } as any);

      const result = await adapter.resolvePlayer('TestPlayer');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('fallback-id');
        expect(result.data.displayName).toBe('TestPlayer');
      }
    });

    it('should handle player not found', async () => {
      mockMakeUniversalSearch.mockResolvedValue({
        domainResponses: [{
          results: [],
        }],
      } as any);

      mockGetProfileFromUserName.mockResolvedValue({
        profile: null,
      } as any);

      const result = await adapter.resolvePlayer('NonexistentPlayer');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAYER_NOT_FOUND');
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle private profiles', async () => {
      mockMakeUniversalSearch.mockRejectedValue({
        message: 'Profile is private',
        response: { status: 403 },
      });

      const result = await adapter.resolvePlayer('PrivatePlayer');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PRIVATE_PROFILE');
      }
    });
  });

  describe('getGameLibrary', () => {
    it('should fetch game library with playtime and trophy data', async () => {
      mockGetUserPlayedGames.mockResolvedValue({
        titles: [
          {
            titleId: 'CUSA12345_00',
            name: 'God of War Ragnarök',
            localizedName: 'God of War Ragnarök',
            imageUrl: 'https://image.api.playstation.com/game1.png',
            localizedImageUrl: 'https://image.api.playstation.com/game1.png',
            category: 'ps5_native_game',
            service: 'none',
            playCount: 50,
            concept: {
              id: 123456,
              titleIds: ['PPSA12345_00'],
              name: 'God of War Ragnarök',
              media: {
                audios: [],
                videos: [],
                images: [{
                  url: 'https://image.api.playstation.com/vulcan/game1_cover.jpg',
                  format: 'PNG',
                  type: 'MASTER_ART',
                }],
              },
            },
            media: {},
            firstPlayedDateTime: '2024-01-01T10:00:00Z',
            lastPlayedDateTime: '2024-01-15T10:30:00Z',
            playDuration: 'PT35H30M', // 35h 30m = 2130 minutes
          },
          {
            titleId: 'PPSA67890_00',
            name: 'Fortnite',
            localizedName: 'Fortnite',
            imageUrl: 'https://image.api.playstation.com/game2.png',
            localizedImageUrl: 'https://image.api.playstation.com/game2.png',
            category: 'ps4_game',
            service: 'none',
            playCount: 200,
            concept: {
              id: 789012,
              titleIds: ['PPSA67890_00', 'CUSA67890_00'],
              name: 'Fortnite',
              media: {
                audios: [],
                videos: [],
                images: [{
                  url: 'https://image.api.playstation.com/vulcan/fortnite.jpg',
                  format: 'PNG',
                  type: 'MASTER_ART',
                }],
              },
            },
            media: {},
            firstPlayedDateTime: '2023-01-01T00:00:00Z',
            lastPlayedDateTime: '2024-01-20T14:00:00Z',
            playDuration: 'PT1651H6M', // 1651h 6m = 99066 minutes
          },
        ],
        totalItemCount: 2,
      } as any);

      mockGetUserTitles.mockResolvedValue({
        trophyTitles: [
          {
            npCommunicationId: 'NPWR12345_00',
            trophyTitleName: 'God of War Ragnarök',
            definedTrophies: { bronze: 23, silver: 10, gold: 5, platinum: 1 },
            earnedTrophies: { bronze: 15, silver: 5, gold: 2, platinum: 0 },
          },
          {
            npCommunicationId: 'NPWR_FORTNITE_00',
            trophyTitleName: 'Fortnite',
            definedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
            earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
          },
        ],
        totalItemCount: 2,
      } as any);

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        
        const [game1, game2] = result.data;
        
        // God of War - 35h 30m = 2130 minutes
        expect(game1.title).toBe('God of War Ragnarök');
        expect(game1.platform).toBe('psn');
        expect(game1.playtimeMinutes).toBe(2130);
        expect(game1.coverUrl).toBe('https://image.api.playstation.com/vulcan/game1_cover.jpg');
        expect(game1.achievementProgress?.earned).toBe(22); // 15+5+2+0
        expect(game1.achievementProgress?.total).toBe(39); // 23+10+5+1
        expect(game1.lastPlayedAt).toEqual(new Date('2024-01-15T10:30:00Z'));
        
        // Fortnite - 1651h 6m = 99066 minutes
        expect(game2.title).toBe('Fortnite');
        expect(game2.playtimeMinutes).toBe(99066);
        expect(game2.achievementProgress).toBeUndefined(); // No trophies
      }
    });

    it('should filter out media apps', async () => {
      mockGetUserPlayedGames.mockResolvedValue({
        titles: [
          {
            titleId: 'GAME123',
            name: 'Real Game',
            category: 'ps5_native_game',
            playCount: 10,
            firstPlayedDateTime: '2024-01-01T00:00:00Z',
            lastPlayedDateTime: '2024-01-02T00:00:00Z',
            playDuration: 'PT10H',
            concept: { id: 1, titleIds: ['GAME123'], name: 'Real Game', media: { audios: [], videos: [], images: [] } },
            media: {},
          },
        ],
        totalItemCount: 1,
      } as any);

      mockGetUserTitles.mockResolvedValue({
        trophyTitles: [],
        totalItemCount: 0,
      } as any);

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(true);
      if (result.success) {
        // Only real games should be returned (media apps filtered by API call)
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe('Real Game');
      }
    });

    it('should parse various ISO 8601 duration formats', async () => {
      mockGetUserPlayedGames.mockResolvedValue({
        titles: [
          {
            titleId: 'TEST1',
            name: 'Test Game 1',
            category: 'ps5_native_game',
            playCount: 1,
            firstPlayedDateTime: '2024-01-01T00:00:00Z',
            lastPlayedDateTime: '2024-01-02T00:00:00Z',
            playDuration: 'PT2H30M', // 2h 30m = 150 minutes
            concept: { id: 1, titleIds: ['TEST1'], name: 'Test Game 1', media: { audios: [], videos: [], images: [] } },
            media: {},
          },
          {
            titleId: 'TEST2',
            name: 'Test Game 2',
            category: 'ps4_game',
            playCount: 1,
            firstPlayedDateTime: '2024-01-01T00:00:00Z',
            lastPlayedDateTime: '2024-01-02T00:00:00Z',
            playDuration: 'PT45M', // 45 minutes
            concept: { id: 2, titleIds: ['TEST2'], name: 'Test Game 2', media: { audios: [], videos: [], images: [] } },
            media: {},
          },
          {
            titleId: 'TEST3',
            name: 'Test Game 3',
            category: 'pspc_game',
            playCount: 1,
            firstPlayedDateTime: '2024-01-01T00:00:00Z',
            lastPlayedDateTime: '2024-01-02T00:00:00Z',
            playDuration: 'PT100H', // 100 hours = 6000 minutes
            concept: { id: 3, titleIds: ['TEST3'], name: 'Test Game 3', media: { audios: [], videos: [], images: [] } },
            media: {},
          },
        ],
        totalItemCount: 3,
      } as any);

      mockGetUserTitles.mockResolvedValue({
        trophyTitles: [],
        totalItemCount: 0,
      } as any);

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].playtimeMinutes).toBe(150); // 2h 30m
        expect(result.data[1].playtimeMinutes).toBe(45); // 45m
        expect(result.data[2].playtimeMinutes).toBe(6000); // 100h
      }
    });

    it('should handle games without trophy data', async () => {
      mockGetUserPlayedGames.mockResolvedValue({
        titles: [{
          titleId: 'TEST_NO_TROPHIES',
          name: 'Test Game',
          category: 'ps5_native_game',
          playCount: 1,
          firstPlayedDateTime: '2024-01-01T00:00:00Z',
          lastPlayedDateTime: '2024-01-02T00:00:00Z',
          playDuration: 'PT10H',
          concept: { id: 1, titleIds: ['TEST_NO_TROPHIES'], name: 'Test Game', media: { audios: [], videos: [], images: [] } },
          media: {},
        }],
        totalItemCount: 1,
      } as any);

      mockGetUserTitles.mockRejectedValue(new Error('Trophy fetch failed'));

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].playtimeMinutes).toBe(600);
        expect(result.data[0].achievementProgress).toBeUndefined();
      }
    });

    it('should handle private game library', async () => {
      mockGetUserPlayedGames.mockRejectedValue({
        message: 'Private library',
        response: { status: 403 },
      });

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PRIVATE_PROFILE');
      }
    });

    it('pages through played games 200 at a time (Sony rejects limit > 200)', async () => {
      const mk = (n: number, start: number, category = 'ps4_game') => Array.from({ length: n }, (_, i) => ({
        titleId: `CUSA${start + i}`, name: `Game ${start + i}`, category, playDuration: 'PT1H',
        concept: { media: { images: [] } }, media: {},
      }));
      mockGetUserPlayedGames
        .mockResolvedValueOnce({ titles: mk(200, 0), totalItemCount: 450 } as any)
        .mockResolvedValueOnce({ titles: mk(200, 200), totalItemCount: 450 } as any)
        .mockResolvedValueOnce({ titles: [...mk(49, 400), ...mk(1, 449, 'ps4_videoservice_web_app')], totalItemCount: 450 } as any);
      mockGetUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 } as any);

      const result = await adapter.getGameLibrary('acct');

      expect(mockGetUserPlayedGames).toHaveBeenCalledTimes(3);
      const calls = mockGetUserPlayedGames.mock.calls.map(c => c[2] as any);
      expect(calls.map(o => o.limit)).toEqual([200, 200, 200]);
      expect(calls.map(o => o.offset)).toEqual([0, 200, 400]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(449); // the videoservice app is dropped
        expect(result.data.some(g => g.id === 'CUSA449')).toBe(false);
      }
    });

    it('drops Netflix/Disney+ style media apps even if returned', async () => {
      mockGetUserPlayedGames.mockResolvedValueOnce({
        titles: [
          { titleId: 'CUSA07022_00', name: 'Fortnite', category: 'ps4_game', playDuration: 'PT1651H6M19S', concept: { media: { images: [] } }, media: {} },
          { titleId: 'CUSA00129_00', name: 'Netflix', category: 'ps4_videoservice_web_app', playDuration: 'PT967H14M36S', concept: { media: { images: [] } }, media: {} },
          { titleId: 'CUSA15607_00', name: 'Disney+', category: 'ps4_videoservice_web_app', playDuration: 'PT2H23S', concept: { media: { images: [] } }, media: {} },
        ],
        totalItemCount: 3,
      } as any);
      mockGetUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 } as any);
      const result = await adapter.getGameLibrary('acct');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.map(g => g.title)).toEqual(['Fortnite']);
        expect(result.data[0].playtimeMinutes).toBe(1651 * 60 + 6);
      }
    });

    it('does not surface raw Sony error text', async () => {
      mockGetUserPlayedGames.mockRejectedValueOnce(new Error('invalid request, requested limit=800 allowed limit=200'));
      const result = await adapter.getGameLibrary('acct');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).not.toContain('limit=');
    });

    it('should handle empty game library', async () => {
      mockGetUserPlayedGames.mockResolvedValue({
        titles: [],
        totalItemCount: 0,
      } as any);

      const result = await adapter.getGameLibrary('test-account-id');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('getGameAchievements', () => {
    it('should fetch trophy list with earned trophies', async () => {
      mockGetTitleTrophies.mockResolvedValue({
        trophies: [
          {
            trophyId: 0,
            trophyHidden: false,
            trophyType: 'bronze',
            trophyName: 'First Steps',
            trophyDetail: 'Complete the tutorial',
            trophyIconUrl: 'https://image.api.playstation.com/trophy1.png',
            trophyGroupId: 'default',
          },
          {
            trophyId: 1,
            trophyHidden: false,
            trophyType: 'gold',
            trophyName: 'Master Hunter',
            trophyDetail: 'Defeat all bosses',
            trophyIconUrl: 'https://image.api.playstation.com/trophy2.png',
            trophyGroupId: 'default',
          },
        ],
        trophySetVersion: '01.00',
        hasTrophyGroups: false,
        totalItemCount: 2,
      } as any);

      mockGetUserTrophiesEarnedForTitle.mockResolvedValue({
        trophies: [
          {
            trophyId: 0,
            trophyHidden: false,
            earned: true,
            earnedDateTime: '2024-01-10T12:00:00Z',
            trophyType: 'bronze',
            trophyRare: 0,
          },
        ],
        trophySetVersion: '01.00',
        hasTrophyGroups: false,
        lastUpdatedDateTime: '2024-01-10T12:00:00Z',
        totalItemCount: 2,
      } as any);

      const result = await adapter.getGameAchievements('test-account-id', 'NPWR12345_00');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        
        expect(result.data[0].id).toBe('0');
        expect(result.data[0].name).toBe('First Steps');
        expect(result.data[0].unlocked).toBe(true);
        expect(result.data[0].unlockedAt).toEqual(new Date('2024-01-10T12:00:00Z'));
        expect(result.data[0].rarity).toBe(0);
        
        expect(result.data[1].id).toBe('1');
        expect(result.data[1].name).toBe('Master Hunter');
        expect(result.data[1].unlocked).toBe(false);
        expect(result.data[1].rarity).toBeUndefined();
      }
    });

    it('should handle empty trophy lists', async () => {
      mockGetTitleTrophies.mockResolvedValue({
        trophies: null,
      } as any);

      const result = await adapter.getGameAchievements('test-account-id', 'NPWR12345_00');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('should handle private trophy data', async () => {
      mockGetTitleTrophies.mockRejectedValue({
        message: 'Private trophies',
        response: { status: 403 },
      });

      const result = await adapter.getGameAchievements('test-account-id', 'NPWR12345_00');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PRIVATE_PROFILE');
      }
    });
  });
});
