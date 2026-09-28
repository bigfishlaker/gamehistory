import type { PlatformAdapter } from './platform-adapter';
import type { PlayerProfile, Game, Achievement, ApiResult } from '../types';
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  makeUniversalSearch,
  getProfileFromUserName,
  getUserTitles,
  getUserPlayedGames,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
  type AuthTokensResponse,
} from 'psn-api';

/** PSN returns http:// avatar URLs; the CSP (img-src https:) and mixed-content rules block them. */
export function toHttps(url: string | undefined): string | undefined {
  return url ? url.replace(/^http:\/\//i, 'https://') : url;
}

interface CachedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// In-memory token cache (resets on server restart)
const tokenCache = new Map<string, CachedTokens>();

/** Sony's gamelist/v2 maximum page size. */
export const PSN_PLAYED_GAMES_PAGE_SIZE = 200;
/** Safety cap so a bad totalItemCount can never loop forever (50 pages = 10,000 titles). */
const PSN_MAX_PAGES = 50;
const GAME_CATEGORIES = 'ps4_game,ps5_native_game,pspc_game';

type PlayedTitle = Awaited<ReturnType<typeof getUserPlayedGames>>['titles'][number];

/** Media apps (Netflix, Disney+, YouTube, Hulu are ps4_videoservice_web_app) are not games. */
function isGameCategory(category: string | undefined): boolean {
  if (!category) return true;
  return !/videoservice|_app$|web_app|unknown/i.test(category);
}

async function fetchAllPlayedGames(auth: AuthTokensResponse, accountId: string): Promise<PlayedTitle[]> {
  const all: PlayedTitle[] = [];
  for (let page = 0; page < PSN_MAX_PAGES; page++) {
    const offset = page * PSN_PLAYED_GAMES_PAGE_SIZE;
    const res = await getUserPlayedGames(auth, accountId, {
      limit: PSN_PLAYED_GAMES_PAGE_SIZE,
      offset,
      categories: GAME_CATEGORIES, // Exclude media apps server-side
    });
    const pageTitles = res?.titles ?? [];
    all.push(...pageTitles);
    const total = typeof res?.totalItemCount === 'number' ? res.totalItemCount : undefined;
    if (pageTitles.length < PSN_PLAYED_GAMES_PAGE_SIZE) break;
    if (total !== undefined && offset + pageTitles.length >= total) break;
  }
  // Belt and braces: drop media apps even if Sony ignores the categories filter.
  return all.filter(t => isGameCategory(t.category));
}

export class PSNAdapter implements PlatformAdapter {
  readonly platform = 'psn';
  private readonly npsso: string;

  constructor(npsso: string) {
    this.npsso = npsso;
  }

  private async getValidAuth(): Promise<ApiResult<AuthTokensResponse>> {
    const cacheKey = `psn:${this.npsso.substring(0, 8)}`;
    const cached = tokenCache.get(cacheKey);

    // Check if we have valid cached tokens
    if (cached && Date.now() < cached.expiresAt - 60000) {
      return {
        success: true,
        data: {
          accessToken: cached.accessToken,
          refreshToken: cached.refreshToken,
          expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000),
          tokenType: 'Bearer',
          scope: '',
          idToken: '',
          refreshTokenExpiresIn: 0,
        },
      };
    }

    // Refresh tokens if we have a refresh token
    if (cached?.refreshToken) {
      try {
        const refreshed = await exchangeRefreshTokenForAuthTokens(cached.refreshToken);
        tokenCache.set(cacheKey, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: Date.now() + refreshed.expiresIn * 1000,
        });
        return { success: true, data: refreshed };
      } catch {
        // Refresh failed, will try full auth below
        tokenCache.delete(cacheKey);
      }
    }

    // Full authentication flow
    try {
      const accessCode = await exchangeNpssoForAccessCode(this.npsso);
      const tokens = await exchangeAccessCodeForAuthTokens(accessCode);
      
      tokenCache.set(cacheKey, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      });

      return { success: true, data: tokens };
    } catch {
      return {
        success: false,
        error: {
          error: 'Authentication failed',
          code: 'AUTH_FAILED',
          message: 'PSN authentication failed. NPSSO token may be invalid or expired. Get a new one from https://ca.account.sony.com/api/v1/ssocookie',
        },
      };
    }
  }

  async resolvePlayer(onlineId: string): Promise<ApiResult<PlayerProfile>> {
    const authResult = await this.getValidAuth();
    if (!authResult.success) {
      return authResult;
    }

    try {
      // Try universal search first
      const searchResults = await makeUniversalSearch(
        authResult.data,
        onlineId,
        'SocialAllAccounts'
      );

      if (searchResults.domainResponses?.[0]?.results?.length > 0) {
        const result = searchResults.domainResponses[0].results[0];
        return {
          success: true,
          data: {
            id: result.socialMetadata.accountId,
            displayName: result.socialMetadata.onlineId,
            avatarUrl: toHttps(result.socialMetadata.avatarUrl),
            platform: 'psn',
          },
        };
      }

      // Fallback to getProfileFromUserName
      const profile = await getProfileFromUserName(authResult.data, onlineId);
      
      if (!profile?.profile) {
        return {
          success: false,
          error: {
            error: 'Not found',
            code: 'PLAYER_NOT_FOUND',
            message: `PSN user "${onlineId}" not found`,
          },
        };
      }

      return {
        success: true,
        data: {
          id: profile.profile.accountId,
          displayName: profile.profile.onlineId,
          avatarUrl: toHttps(profile.profile.avatarUrls?.[0]?.avatarUrl),
          platform: 'psn',
        },
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && ('message' in error || 'response' in error)) {
        const err = error as { message?: string; response?: { status?: number } };
        if (err?.message?.includes('private') || err?.response?.status === 403) {
          return {
            success: false,
            error: {
              error: 'Private profile',
              code: 'PRIVATE_PROFILE',
              message: 'This PSN profile is private',
            },
          };
        }
      }

      return {
        success: false,
        error: {
          error: 'Lookup failed',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getGameLibrary(accountId: string): Promise<ApiResult<Game[]>> {
    const authResult = await this.getValidAuth();
    if (!authResult.success) {
      return authResult;
    }

    try {
      // Fetch played games for playtime and covers
      // gamelist/v2 played games: Sony rejects limit > 200
      // ("invalid request, requested limit=800 allowed limit=200"), so page through.
      const titles = await fetchAllPlayedGames(authResult.data, accountId);
      if (titles.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch trophy data to enrich with achievement counts
      let trophyMap: Map<string, { earned: number; total: number }> | undefined;
      try {
        const trophyData = await getUserTitles(authResult.data, accountId, { limit: 800 });
        if (trophyData?.trophyTitles) {
          trophyMap = new Map();
          for (const trophy of trophyData.trophyTitles) {
            const total = trophy.definedTrophies.bronze + trophy.definedTrophies.silver +
                         trophy.definedTrophies.gold + trophy.definedTrophies.platinum;
            const earned = trophy.earnedTrophies.bronze + trophy.earnedTrophies.silver +
                          trophy.earnedTrophies.gold + trophy.earnedTrophies.platinum;
            // Map by normalized title for merging
            const normalizedTitle = trophy.trophyTitleName.toLowerCase().trim();
            if (total > 0) {
              trophyMap.set(normalizedTitle, { earned, total });
            }
          }
        }
      } catch {
        // Trophy fetch failed, continue without trophy data
      }

      const games: Game[] = titles.map(title => {
        // Parse ISO 8601 duration (PT1651H6M33S) to minutes
        let playtimeMinutes: number | undefined;
        if (title.playDuration) {
          const duration = title.playDuration;
          const hours = duration.match(/(\d+)H/)?.[1] || '0';
          const minutes = duration.match(/(\d+)M/)?.[1] || '0';
          playtimeMinutes = parseInt(hours) * 60 + parseInt(minutes);
        }

        // Parse last played date
        let lastPlayedAt: Date | undefined;
        if (title.lastPlayedDateTime) {
          lastPlayedAt = new Date(title.lastPlayedDateTime);
        }

        // Get cover image from concept media
        let coverUrl: string | undefined;
        if (title.concept?.media?.images && title.concept.media.images.length > 0) {
          coverUrl = title.concept.media.images[0].url;
        } else if (title.imageUrl) {
          coverUrl = title.imageUrl;
        }

        // Try to match trophy data by normalized title
        const normalizedTitle = title.name.toLowerCase().trim();
        const trophyData = trophyMap?.get(normalizedTitle);

        return {
          id: title.titleId,
          title: title.name,
          platform: 'psn',
          coverUrl,
          playtimeMinutes,
          lastPlayedAt,
          achievementProgress: trophyData ? {
            earned: trophyData.earned,
            total: trophyData.total,
          } : undefined,
        };
      });

      return { success: true, data: games };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && ('message' in error || 'response' in error)) {
        const err = error as { message?: string; response?: { status?: number } };
        if (err?.message?.includes('private') || err?.response?.status === 403) {
          return {
            success: false,
            error: {
              error: 'Private profile',
              code: 'PRIVATE_PROFILE',
              message: 'This PSN user\'s game library is private',
            },
          };
        }
      }

      console.warn('[psn] getGameLibrary failed:', error instanceof Error ? error.message : String(error));
      return {
        success: false,
        error: {
          error: 'Library fetch failed',
          message: "Couldn't load this PlayStation game library right now. Please try again shortly.",
        },
      };
    }
  }

  async getGameAchievements(accountId: string, gamePlatform: string): Promise<ApiResult<Achievement[]>> {
    const authResult = await this.getValidAuth();
    if (!authResult.success) {
      return authResult;
    }

    try {
      // Get trophy groups for the title (using "all" for all trophies)
      const titleTrophies = await getTitleTrophies(
        authResult.data,
        gamePlatform,
        'all'
      );
      
      if (!titleTrophies?.trophies) {
        return { success: true, data: [] };
      }

      // Get user's earned trophies
      const earnedTrophies = await getUserTrophiesEarnedForTitle(
        authResult.data,
        accountId,
        gamePlatform,
        'all'
      );

      const earnedMap = new Map(
        earnedTrophies?.trophies?.map(t => [t.trophyId, t]) || []
      );

      const achievements: Achievement[] = titleTrophies.trophies.map(trophy => {
        const earned = earnedMap.get(trophy.trophyId);
        
        return {
          id: String(trophy.trophyId),
          name: trophy.trophyName || 'Unknown Trophy',
          description: trophy.trophyDetail || '',
          iconUrl: trophy.trophyIconUrl,
          unlocked: earned?.earned || false,
          unlockedAt: earned?.earnedDateTime ? new Date(earned.earnedDateTime) : undefined,
          rarity: earned?.trophyRare,
        };
      });

      return { success: true, data: achievements };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && ('message' in error || 'response' in error)) {
        const err = error as { message?: string; response?: { status?: number } };
        if (err?.message?.includes('private') || err?.response?.status === 403) {
          return {
            success: false,
            error: {
              error: 'Private profile',
              code: 'PRIVATE_PROFILE',
              message: 'Trophy data is private',
            },
          };
        }
      }

      return {
        success: false,
        error: {
          error: 'Achievements fetch failed',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
