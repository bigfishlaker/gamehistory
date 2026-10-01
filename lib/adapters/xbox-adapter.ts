import type { PlatformAdapter } from './platform-adapter';
import type { PlayerProfile, Game, Achievement, ApiResult, RateLimitInfo } from '../types';
import { normalizeXboxImageUrl, normalizeXboxAvatarUrl } from '../utils/xbox-images';
import { userSafeError } from '../utils/safe-error';
import { reserveOpenXblRequest, recordOpenXblRemaining, BUSY_MESSAGE } from '../rate-limit';

interface OpenXBLWrappedResponse<T> {
  content: T | string;
  code: number;
}

interface OpenXBLErrorContent {
  code?: number;
  StatusCode?: number;
  source?: string;
  description?: string;
}

interface OpenXBLRateLimitContent {
  version: number;
  currentRequests: number;
  maxRequests: number;
  periodInSeconds: number;
  limitType: string;
}

/** Where a player makes their Xbox game history visible to everyone. */
export const XBOX_PRIVACY_PATH =
  'Settings > Account > Privacy & online safety > Xbox privacy > View details & customize > Game & app content: Everybody';

/**
 * Xbox title history does not fail with 403 when a player hides their game history:
 * it answers 200 with `titles: []` (verified 2026-10-01 for "nF Colors", gamerscore 45,
 * while the same endpoint returned 1000 titles for Stallion83). A profile with
 * gamerscore > 0 and no titles is therefore hidden; with 0/unknown gamerscore it is
 * either hidden or genuinely empty.
 */
export function xboxEmptyHistoryMessage(gamerscore?: number): string {
  if (typeof gamerscore === 'number' && gamerscore > 0) {
    return `This player's Xbox game history is private — ${XBOX_PRIVACY_PATH}.`;
  }
  return `No Xbox games are visible for this player. If they have played games, their Xbox game history is private — ${XBOX_PRIVACY_PATH}.`;
}

function parseGamerscore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface OpenXBLSearchResult {
  xuid?: string;
  gamertag?: string;
  /** /v2/search people entries carry gamerscore as a string. */
  gamerScore?: string;
  profileUsers?: Array<{
    id: string;
    settings: Array<{
      id: string;
      value: string;
    }>;
  }>;
}

interface OpenXBLTitleHistory {
  xuid: string;
  titles: Array<{
    titleId: string;
    name: string;
    achievement: {
      currentAchievements: number;
      totalAchievements: number;
      currentGamerscore: number;
      totalGamerscore: number;
      progressPercentage?: number;
    };
    displayImage?: string;
    /** "Game" or "App" when OpenXBL includes it. */
    type?: string;
    lastUnlock?: string;
    titleHistory?: {
      lastTimePlayed?: string;
    };
    stats?: {
      minutesPlayed?: number;
    };
  }>;
}

interface OpenXBLPlayerStats {
  statlistscollection?: Array<{
    arrangebyfieldid?: string;
    stats?: Array<{
      xuid?: string;
      titleid?: string;
      name?: string;
      type?: string;
      /** Missing when the title defines the stat but the player has no value. */
      value?: string;
    }>;
  }>;
}

/** OpenXBL POST /v2/player/stats accepted all 101 of the test account's titles in one call; chunk defensively. */
const PLAYTIME_BATCH_SIZE = 100;

/** GET /v2/achievements/x360/{xuid}/title/{titleId}: Xbox 360 titles (only unlocked achievements are returned). */
interface OpenXBLX360Achievements {
  achievements?: Array<{
    id: number;
    name: string;
    description?: string;
    lockedDescription?: string;
    unlocked?: boolean;
    timeUnlocked?: string;
    rarity?: { currentPercentage?: number };
  }>;
}

interface OpenXBLAchievements {
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    mediaAssets?: Array<{
      type: string;
      url: string;
    }>;
    progression: {
      timeUnlocked?: string;
    };
    progressState: string;
    rarity?: {
      currentPercentage: number;
    };
  }>;
}


export class XboxAdapter implements PlatformAdapter {
  readonly platform = 'xbox';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.xbl.io';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string, body?: unknown): Promise<ApiResult<T>> {
    // Global OpenXBL budget (150/hr free tier, 20 kept in reserve), shared by all
    // serverless instances through the store. Checked before every upstream call.
    const budget = await reserveOpenXblRequest();
    if (!budget.allowed) {
      return {
        success: false,
        error: { error: 'Busy', code: 'BUDGET_EXHAUSTED', message: BUSY_MESSAGE },
        rateLimit: { remaining: budget.upstreamRemaining },
      };
    }
    try {
      const headers: Record<string, string> = {
        'X-Authorization': this.apiKey,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
      };
      const init: RequestInit = { headers };
      if (body !== undefined) {
        init.method = 'POST';
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const response = await fetch(`${this.baseUrl}${endpoint}`, init);

      // Extract rate limit headers
      const rateLimit: RateLimitInfo = {
        remaining: response.headers.get('X-RateLimit-Remaining') 
          ? parseInt(response.headers.get('X-RateLimit-Remaining')!, 10) 
          : undefined,
        limit: response.headers.get('X-RateLimit-Limit')
          ? parseInt(response.headers.get('X-RateLimit-Limit')!, 10)
          : undefined,
        reset: response.headers.get('X-RateLimit-Reset')
          ? parseInt(response.headers.get('X-RateLimit-Reset')!, 10)
          : undefined,
      };

      await recordOpenXblRemaining(rateLimit.remaining, rateLimit.reset);

      if (!response.ok) {
        // Log the upstream body server-side only; users get a plain sentence.
        console.warn(`[xbox] ${endpoint.split('?')[0]} HTTP ${response.status}:`, (await response.text()).slice(0, 300));
        return {
          success: false,
          error: {
            error: 'API error',
            code: `HTTP_${response.status}`,
            message: `Xbox Live request failed (HTTP ${response.status}).`,
          },
          rateLimit,
        };
      }

      const wrapped = await response.json() as OpenXBLWrappedResponse<T | OpenXBLErrorContent | OpenXBLRateLimitContent>;
      
      if (typeof wrapped.content === 'string') {
        console.warn(`[xbox] ${endpoint.split('?')[0]} API ${wrapped.code}:`, wrapped.content.slice(0, 300));
        return {
          success: false,
          error: {
            error: 'API error',
            code: `API_${wrapped.code}`,
            // Plain-text OpenXBL messages pass through; JSON/HTML bodies do not.
            message: userSafeError(wrapped.content, 'Xbox Live request failed.'),
          },
          rateLimit,
        };
      }
      
      const content = wrapped.content;
      if (wrapped.code === 429 || (content && typeof content === 'object' && content !== null && 'limitType' in content)) {
        const limitContent = content as OpenXBLRateLimitContent;
        return {
          success: false,
          error: {
            error: 'Rate limited',
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded: ${limitContent.currentRequests}/${limitContent.maxRequests} requests in ${limitContent.periodInSeconds}s. Please wait before retrying.`,
          },
          rateLimit,
        };
      }

      if (wrapped.code === 404 || (wrapped.code >= 400 && content && typeof content === 'object' && content !== null && 'StatusCode' in content)) {
        const errorContent = content as OpenXBLErrorContent;
        if (errorContent.StatusCode === 404) {
          return {
            success: false,
            error: {
              error: 'Not found',
              code: 'PLAYER_NOT_FOUND',
              message: errorContent.description || 'Player not found',
            },
            rateLimit,
          };
        }
        return {
          success: false,
          error: {
            error: 'API error',
            code: `API_${wrapped.code}`,
            message: errorContent.description || 'API request failed',
          },
          rateLimit,
        };
      }

      if (wrapped.code >= 400) {
        return {
          success: false,
          error: {
            error: 'API error',
            code: `API_${wrapped.code}`,
            message: 'API request failed',
          },
          rateLimit,
        };
      }

      return { success: true, data: wrapped.content as T, rateLimit };
    } catch (error) {
      return {
        success: false,
        error: {
          error: 'Network error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async resolvePlayer(gamertag: string): Promise<ApiResult<PlayerProfile>> {
    const searchResult = await this.fetch<OpenXBLSearchResult>(`/v2/friends/search?gt=${encodeURIComponent(gamertag)}`);
    
    let xuid: string | undefined;
    let displayName = gamertag;
    let avatarUrl: string | undefined;
    let gamerscore: number | undefined;
    
    if (!searchResult.success) {
      const fuzzyResult = await this.fetch<{ people: OpenXBLSearchResult[] }>(`/v2/search/${encodeURIComponent(gamertag)}`);
      if (!fuzzyResult.success) {
        return fuzzyResult;
      }
      
      const firstMatch = fuzzyResult.data.people?.[0];
      if (!firstMatch?.xuid) {
        return {
          success: false,
          error: {
            error: 'Not found',
            code: 'PLAYER_NOT_FOUND',
            message: `Gamertag "${gamertag}" not found`,
          },
        };
      }

      xuid = firstMatch.xuid;
      gamerscore = parseGamerscore(firstMatch.gamerScore);
    } else {
      xuid = searchResult.data.xuid ?? searchResult.data.profileUsers?.[0]?.id;
      
      if (searchResult.data.profileUsers?.[0]) {
        const user = searchResult.data.profileUsers[0];
        displayName = user.settings?.find(s => s.id === 'Gamertag')?.value || gamertag;
        avatarUrl = normalizeXboxAvatarUrl(user.settings?.find(s => s.id === 'GameDisplayPicRaw')?.value);
        gamerscore = parseGamerscore(user.settings?.find(s => s.id === 'Gamerscore')?.value);
      }
    }

    if (!xuid) {
      return {
        success: false,
        error: {
          error: 'Invalid response',
          message: 'No XUID in response',
        },
      };
    }

    return {
      success: true,
      data: {
        id: xuid,
        displayName,
        avatarUrl,
        platform: 'xbox',
        ...(gamerscore !== undefined ? { gamerscore } : {}),
      },
    };
  }

  async getGameLibrary(xuid: string): Promise<ApiResult<Game[]>> {
    const result = await this.fetch<OpenXBLTitleHistory>(`/v2/achievements/player/${xuid}`);
    if (!result.success) {
      return result;
    }

    const games = result.data.titles?.map(title => {
      const lastPlayed = title.titleHistory?.lastTimePlayed || title.lastUnlock;
      const totalAchievements = title.achievement.totalAchievements;
      const currentAchievements = title.achievement.currentAchievements;
      
      let achievementProgress = undefined;
      if (totalAchievements > 0) {
        achievementProgress = {
          earned: currentAchievements,
          total: totalAchievements,
        };
      } else if (currentAchievements > 0) {
        // Newer titles report totalAchievements: 0 even when achievements are
        // unlocked (e.g. CoD WWII: 12 unlocked of 90). Keep the real unlocked count;
        // total 0 means "total unknown", so no fake percentage is shown.
        achievementProgress = {
          earned: currentAchievements,
          total: 0,
        };
      }

      return {
        id: title.titleId,
        title: title.name,
        platform: 'xbox' as const,
        coverUrl: normalizeXboxImageUrl(title.displayImage),
        playtimeMinutes: title.stats?.minutesPlayed,
        lastPlayedAt: lastPlayed ? new Date(lastPlayed) : undefined,
        achievementProgress,
        ...(title.type ? { category: title.type } : {}),
      };
    }) || [];

    return { success: true, data: games };
  }

  async getGameAchievements(xuid: string, titleId: string): Promise<ApiResult<Achievement[]>> {
    const result = await this.fetch<OpenXBLAchievements>(`/v2/achievements/player/${xuid}/${titleId}`);
    if (!result.success) {
      return result;
    }

    const achievements = result.data.achievements?.map(ach => {
      const iconAsset = ach.mediaAssets?.find(a => a.type === 'Icon');
      return {
        id: ach.id,
        name: ach.name,
        description: ach.description,
        iconUrl: iconAsset?.url,
        unlocked: ach.progressState === 'Achieved',
        unlockedAt: ach.progression.timeUnlocked ? new Date(ach.progression.timeUnlocked) : undefined,
        rarity: ach.rarity?.currentPercentage,
      };
    }) || [];

    if (achievements.length > 0) {
      return { success: true, data: achievements };
    }

    // Xbox 360 titles (incl. back-compat, e.g. COD: Black Ops II 1096157379) come back
    // empty from the modern endpoint even with 18 unlocked. They live in the legacy
    // service, exposed by OpenXBL as /v2/achievements/x360/{xuid}/title/{titleId}.
    // Costs one extra request, only when the modern endpoint returned nothing.
    const legacy = await this.fetch<OpenXBLX360Achievements>(`/v2/achievements/x360/${xuid}/title/${titleId}`);
    if (!legacy.success) {
      return { success: true, data: achievements };
    }
    const legacyAchievements = (legacy.data.achievements ?? []).map(ach => ({
      id: String(ach.id),
      name: ach.name,
      description: ach.description || ach.lockedDescription || '',
      unlocked: ach.unlocked === true,
      unlockedAt: ach.unlocked && ach.timeUnlocked ? new Date(ach.timeUnlocked) : undefined,
      rarity: ach.rarity?.currentPercentage,
    }));
    return { success: true, data: legacyAchievements };
  }

  /**
   * Xbox title history has no playtime. The "MinutesPlayed" user stat does, and
   * OpenXBL exposes it for many titles at once via POST /v2/player/stats, so a
   * whole library costs 1 request (per 100 titles) instead of 1 per title.
   * Returns titleId -> minutes only for titles that actually report a value;
   * titles missing from the map have unknown playtime.
   */
  async getTitlePlaytimes(xuid: string, titleIds: string[]): Promise<ApiResult<Record<string, number>>> {
    const minutes: Record<string, number> = {};
    const unique = Array.from(new Set(titleIds.filter(Boolean)));

    for (let i = 0; i < unique.length; i += PLAYTIME_BATCH_SIZE) {
      const chunk = unique.slice(i, i + PLAYTIME_BATCH_SIZE);
      const result = await this.fetch<OpenXBLPlayerStats>('/v2/player/stats', {
        // OpenXBL answers VALIDATION_ERROR "Invalid request parameters" for the
        // arrangebyfield/titleid variant; this is the body that returned real
        // MinutesPlayed (verified against a real account).
        xuids: [xuid],
        stats: chunk.map(titleId => ({ name: 'MinutesPlayed', titleId })),
      });
      if (!result.success) {
        return result;
      }

      for (const list of result.data.statlistscollection ?? []) {
        for (const stat of list.stats ?? []) {
          // Only process stats for the target xuid to avoid mixing data
          if (stat.xuid && stat.xuid !== xuid) {
            continue;
          }
          if (stat.name !== 'MinutesPlayed' || !stat.titleid || stat.value === undefined || stat.value === null) {
            continue;
          }
          const value = Number(stat.value);
          // Treat 0 as unknown unless explicitly returned by the API
          if (Number.isFinite(value) && value > 0) {
            minutes[stat.titleid] = (minutes[stat.titleid] ?? 0) + value;
          }
        }
      }
    }

    return { success: true, data: minutes };
  }

}
