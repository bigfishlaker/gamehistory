import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SteamAdapter } from '../lib/adapters/steam-adapter';

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = mockFetch as any;

describe('SteamAdapter', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    adapter = new SteamAdapter('test-api-key');
    mockFetch.mockClear();
  });

  describe('resolvePlayer', () => {
    it('should resolve a player with SteamID64', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            players: [
              {
                steamid: '76561197960287930',
                personaname: 'TestPlayer',
                avatarfull: 'http://avatar.jpg',
                communityvisibilitystate: 3,
              },
            ],
          },
        }),
        headers: new Headers(),
      });

      const result = await adapter.resolvePlayer('76561197960287930');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('76561197960287930');
        expect(result.data.displayName).toBe('TestPlayer');
        expect(result.data.platform).toBe('steam');
      }
    });

    it('should resolve a player with vanity URL', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              success: 1,
              steamid: '76561197960287930',
            },
          }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              players: [
                {
                  steamid: '76561197960287930',
                  personaname: 'TestPlayer',
                  communityvisibilitystate: 3,
                },
              ],
            },
          }),
          headers: new Headers(),
        });

      const result = await adapter.resolvePlayer('testvanity');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('76561197960287930');
      }
    });

    it('should handle private profiles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            players: [
              {
                steamid: '76561197960287930',
                personaname: 'PrivatePlayer',
                communityvisibilitystate: 1,
              },
            ],
          },
        }),
        headers: new Headers(),
      });

      const result = await adapter.resolvePlayer('76561197960287930');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PRIVATE_PROFILE');
      }
    });

    it('should extract Steam ID from URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            players: [
              {
                steamid: '76561197960287930',
                personaname: 'TestPlayer',
                communityvisibilitystate: 3,
              },
            ],
          },
        }),
        headers: new Headers(),
      });

      const result = await adapter.resolvePlayer('https://steamcommunity.com/profiles/76561197960287930');
      
      expect(result.success).toBe(true);
    });
  });

  describe('resolvePlayer input normalization', () => {
    const ID = '76561199841807403';
    const summary = (steamid: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        response: { players: [{ steamid, personaname: 'Someone', communityvisibilitystate: 3 }] },
      }),
      headers: new Headers(),
    });
    const calledPath = (i: number) => new URL(mockFetch.mock.calls[i][0] as string);

    it('uses the ID64 from a pasted profile URL (not the raw URL)', async () => {
      mockFetch.mockResolvedValueOnce(summary(ID));
      const result = await adapter.resolvePlayer(`https://steamcommunity.com/profiles/${ID}/`);

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.id).toBe(ID);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(calledPath(0).searchParams.get('steamids')).toBe(ID);
    });

    it('resolves an /id/<vanity> URL via ResolveVanityURL', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ response: { success: 1, steamid: ID } }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce(summary(ID));
      const result = await adapter.resolvePlayer('https://www.steamcommunity.com/id/somevanity/games');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.id).toBe(ID);
      expect(calledPath(0).pathname).toBe('/ISteamUser/ResolveVanityURL/v1/');
      expect(calledPath(0).searchParams.get('vanityurl')).toBe('somevanity');
      expect(calledPath(1).searchParams.get('steamids')).toBe(ID);
    });

    it('gives a friendly message for an unknown vanity name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ response: { success: 42, message: 'No match' } }),
        headers: new Headers(),
      });
      const result = await adapter.resolvePlayer('no-such-vanity-xyz');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PLAYER_NOT_FOUND');
        expect(result.error.message).toBe(
          "Couldn't find that Steam profile. Paste your profile link or 17-digit Steam ID."
        );
      }
    });

    it('rejects invalid input without calling Steam', async () => {
      const result = await adapter.resolvePlayer('https://example.com/whatever');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toMatch(/Couldn't find that Steam profile/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('never surfaces an upstream HTML error body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '<html><body>Bad Request Missing required routing parameter</body></html>',
        headers: new Headers(),
      });
      const result = await adapter.getGameLibrary(ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).not.toMatch(/<html|Bad Request|routing/i);
        expect(result.error.code).toBe('HTTP_400');
      }
    });
  });

  describe('getGameLibrary', () => {
    it('should fetch game library successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            games: [
              {
                appid: 440,
                name: 'Team Fortress 2',
                playtime_forever: 1234,
                rtime_last_played: 1609459200,
                img_icon_url: 'abc123',
                has_community_visible_stats: true,
              },
            ],
          },
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('76561197960287930');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe('Team Fortress 2');
        expect(result.data[0].playtimeMinutes).toBe(1234);
      }
    });

    it('should handle private game details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          response: {},
        }),
        headers: new Headers(),
      });

      const result = await adapter.getGameLibrary('76561197960287930');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PRIVATE_PROFILE');
      }
    });
  });

  describe('getGameAchievements', () => {
    it('should fetch achievements with schema', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            game: {
              availableGameStats: {
                achievements: [
                  {
                    name: 'ACH_1',
                    displayName: 'First Achievement',
                    description: 'Complete tutorial',
                    icon: 'http://icon.jpg',
                    icongray: 'http://icon-gray.jpg',
                  },
                ],
              },
            },
          }),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            playerstats: {
              achievements: [
                {
                  apiname: 'ACH_1',
                  achieved: 1,
                  unlocktime: 1609459200,
                },
              ],
            },
          }),
          headers: new Headers(),
        });

      const result = await adapter.getGameAchievements('76561197960287930', '440');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('First Achievement');
        expect(result.data[0].unlocked).toBe(true);
      }
    });
  });
});
