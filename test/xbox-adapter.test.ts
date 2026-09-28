import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XboxAdapter } from '../lib/adapters/xbox-adapter';

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = mockFetch as any;

describe('XboxAdapter', () => {
  let adapter: XboxAdapter;

  beforeEach(() => {
    adapter = new XboxAdapter('test-api-key');
    mockFetch.mockClear();
  });

  describe('resolvePlayer', () => {
    it('should resolve a player successfully with wrapped response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            profileUsers: [
              {
                id: '2533275006943389',
                settings: [
                  { id: 'Gamertag', value: 'SHRAPNELINDABUT' },
                  { id: 'GameDisplayPicRaw', value: 'http://avatar.jpg' },
                ],
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.resolvePlayer('SHRAPNELINDABUT');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('2533275006943389');
        expect(result.data.displayName).toBe('SHRAPNELINDABUT');
        expect(result.data.platform).toBe('xbox');
      }
    });

    it('should handle player not found with inner 404', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: {
              code: 28,
              StatusCode: 404,
              source: 'Profile',
              description: 'The server found no data for the requested entity.',
            },
            code: 404,
          }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: { people: [] },
            code: 200,
          }),
          headers: new Headers(),
        });

      const result = await adapter.resolvePlayer('NonExistentUser');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAYER_NOT_FOUND');
      }
    });

    it('should handle rate limiting with inner 429', async () => {
      const mockHeaders = {
        get: (name: string) => (name === 'Retry-After' ? '60' : null),
      };
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: {
              version: 1,
              currentRequests: 74,
              maxRequests: 60,
              periodInSeconds: 300,
              limitType: 'Rate',
            },
            code: 429,
          }),
          headers: mockHeaders,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: {
              version: 1,
              currentRequests: 74,
              maxRequests: 60,
              periodInSeconds: 300,
              limitType: 'Rate',
            },
            code: 429,
          }),
          headers: mockHeaders,
        });

      const result = await adapter.resolvePlayer('TestUser');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.message).toContain('74/60');
        expect(result.error.message).toContain('300s');
      }
    });

    it('should handle rate limiting with HTTP 200 and limitType in content', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: {
              version: 1,
              currentRequests: 65,
              maxRequests: 60,
              periodInSeconds: 300,
              limitType: 'Rate',
            },
            code: 200,
          }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            content: {
              version: 1,
              currentRequests: 65,
              maxRequests: 60,
              periodInSeconds: 300,
              limitType: 'Rate',
            },
            code: 200,
          }),
          headers: new Headers(),
        });

      const result = await adapter.resolvePlayer('TestUser');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('getGameLibrary', () => {
    it('should fetch game library with wrapped response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '123',
                name: 'Test Game',
                achievement: {
                  currentAchievements: 10,
                  totalAchievements: 50,
                  currentGamerscore: 100,
                  totalGamerscore: 1000,
                },
                displayImage: 'http://cover.jpg',
                titleHistory: {
                  lastTimePlayed: '2023-01-01T00:00:00Z',
                },
                stats: {
                  minutesPlayed: 120,
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe('Test Game');
        expect(result.data[0].achievementProgress?.earned).toBe(10);
        expect(result.data[0].achievementProgress?.total).toBe(50);
      }
    });

    it('keeps the unlocked count when totalAchievements is 0 but achievements are unlocked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '545844082',
                name: 'Call of Duty: WWII',
                achievement: {
                  currentAchievements: 12,
                  totalAchievements: 0,
                  currentGamerscore: 185,
                  totalGamerscore: 1500,
                  progressPercentage: 12,
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].achievementProgress).toEqual({ earned: 12, total: 0 });
      }
    });

    it('should not show achievement progress when totalAchievements is 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '456',
                name: 'Modern Game',
                achievement: {
                  currentAchievements: 0,
                  totalAchievements: 0,
                  currentGamerscore: 0,
                  totalGamerscore: 0,
                  progressPercentage: 45.5,
                },
                displayImage: 'http://cover.jpg',
                titleHistory: {
                  lastTimePlayed: '2023-01-01T00:00:00Z',
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].achievementProgress).toBeUndefined();
      }
    });

    it('should prefer titleHistory.lastTimePlayed over lastUnlock', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '789',
                name: 'Game With Both Dates',
                achievement: {
                  currentAchievements: 5,
                  totalAchievements: 10,
                  currentGamerscore: 50,
                  totalGamerscore: 100,
                },
                lastUnlock: '2023-01-01T00:00:00Z',
                titleHistory: {
                  lastTimePlayed: '2023-02-01T00:00:00Z',
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].lastPlayedAt?.toISOString()).toBe(new Date('2023-02-01T00:00:00Z').toISOString());
      }
    });

    it('should handle missing minutesPlayed in stats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '999',
                name: 'Game Without Stats',
                achievement: {
                  currentAchievements: 0,
                  totalAchievements: 10,
                  currentGamerscore: 0,
                  totalGamerscore: 100,
                },
                titleHistory: {
                  lastTimePlayed: '2023-01-01T00:00:00Z',
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].playtimeMinutes).toBeUndefined();
      }
    });

    it('should normalize http Xbox image URLs to https with w=600', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            xuid: '1234567890',
            titles: [
              {
                titleId: '888',
                name: 'Game With HTTP Image',
                achievement: {
                  currentAchievements: 5,
                  totalAchievements: 10,
                  currentGamerscore: 50,
                  totalGamerscore: 100,
                },
                displayImage: 'http://store-images.s-microsoft.com/image/apps.31326.jpg',
                titleHistory: {
                  lastTimePlayed: '2023-01-01T00:00:00Z',
                },
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('1234567890');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].coverUrl).toBe('https://store-images.s-microsoft.com/image/apps.31326.jpg?w=600');
      }
    });
  });

  describe('getGameAchievements', () => {
    it('should fetch achievements with wrapped response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            achievements: [
              {
                id: 'ach1',
                name: 'First Achievement',
                description: 'Complete the tutorial',
                mediaAssets: [{ type: 'Icon', url: 'http://icon.jpg' }],
                progression: { timeUnlocked: '2023-01-01T00:00:00Z' },
                progressState: 'Achieved',
                rarity: { currentPercentage: 75.5 },
              },
              {
                id: 'ach2',
                name: 'Second Achievement',
                description: 'Locked achievement',
                mediaAssets: [],
                progression: {},
                progressState: 'NotStarted',
              },
            ],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameAchievements('1234567890', '123');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].unlocked).toBe(true);
        expect(result.data[0].rarity).toBe(75.5);
        expect(result.data[1].unlocked).toBe(false);
      }
    });

    it('should handle Accept-Language rejection with string content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: '["Request contains Accept-Language header with invalid locale value: *"]',
          code: 400,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameAchievements('1234567890', '123');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_400');
        expect(result.error.message).toContain('Accept-Language');
        expect(result.error.message).toContain('invalid locale value');
      }
    });
  });

  describe('getTitlePlaytimes', () => {
    it('should fetch playtime stats with the xuids + titleId body OpenXBL accepts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            statlistscollection: [{
              arrangebyfieldid: 'xuid',
              stats: [
                {
                  xuid: '2533274796433767',
                  titleid: '123456789',
                  name: 'MinutesPlayed',
                  type: 'Integer',
                  value: '150',
                },
                {
                  xuid: '2533274796433767',
                  titleid: '987654321',
                  name: 'MinutesPlayed',
                  type: 'Integer',
                  value: '300',
                },
              ],
            }],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getTitlePlaytimes('2533274796433767', ['123456789', '987654321']);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['123456789']).toBe(150);
        expect(result.data['987654321']).toBe(300);
      }

      // Verify request format
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.xbl.io/v2/player/stats',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            xuids: ['2533274796433767'],
            stats: [
              { name: 'MinutesPlayed', titleId: '123456789' },
              { name: 'MinutesPlayed', titleId: '987654321' },
            ],
          }),
        })
      );
    });

    it('never returns the raw upstream body as the error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"code":"VALIDATION_ERROR","message":"Invalid request parameters"}',
        headers: new Headers(),
      });
      const result = await adapter.getTitlePlaytimes('2533274796433767', ['123456789']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Xbox Live request failed (HTTP 400).');
        expect(result.error.message).not.toContain('VALIDATION_ERROR');
      }
    });

    it('should treat zero minutes as unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            statlistscollection: [{
              stats: [
                {
                  xuid: '2533274796433767',
                  titleid: '123',
                  name: 'MinutesPlayed',
                  value: '0',
                },
                {
                  xuid: '2533274796433767',
                  titleid: '456',
                  name: 'MinutesPlayed',
                  value: '100',
                },
              ],
            }],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getTitlePlaytimes('2533274796433767', ['123', '456']);
      
      expect(result.success).toBe(true);
      if (result.success) {
        // Zero should not be in the result (treated as unknown)
        expect(result.data['123']).toBeUndefined();
        // Non-zero should be present
        expect(result.data['456']).toBe(100);
      }
    });

    it('should filter stats by target xuid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            statlistscollection: [{
              stats: [
                {
                  xuid: '2533274796433767',
                  titleid: '123',
                  name: 'MinutesPlayed',
                  value: '150',
                },
                {
                  xuid: 'different-xuid',
                  titleid: '123',
                  name: 'MinutesPlayed',
                  value: '999',
                },
              ],
            }],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getTitlePlaytimes('2533274796433767', ['123']);
      
      expect(result.success).toBe(true);
      if (result.success) {
        // Should only include stats for target xuid
        expect(result.data['123']).toBe(150);
      }
    });

    it('should handle missing value as unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            statlistscollection: [{
              stats: [
                {
                  xuid: '2533274796433767',
                  titleid: '123',
                  name: 'MinutesPlayed',
                  // value is undefined (not returned by API)
                },
              ],
            }],
          },
          code: 200,
        }),
        headers: new Headers(),
      });

      const result = await adapter.getTitlePlaytimes('2533274796433767', ['123']);
      
      expect(result.success).toBe(true);
      if (result.success) {
        // Missing value should not be in result
        expect(result.data['123']).toBeUndefined();
      }
    });
  });
});
