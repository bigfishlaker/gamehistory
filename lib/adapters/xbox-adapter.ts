import type { PlatformAdapter } from './platform-adapter';
import type { PlayerProfile, Game, Achievement, ApiResult, RateLimitInfo } from '../types';
import { normalizeXboxImageUrl, normalizeXboxAvatarUrl } from '../utils/xbox-images';
import { userSafeError } from '../utils/safe-error';
import { reserveOpenXblRequest, recordOpenXblRemaining, BUSY_MESSAGE } from '../rate-limit';
import { XBOX_XUID_RE } from '../validators';

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

function withGamerscore(gamerscore: number | undefined): { gamerscore?: number } {
  return gamerscore !== undefined ? { gamerscore } : {};
}

function notFound(message: string): ApiResult<PlayerProfile> {
  return { success: false, error: { error: 'Not found', code: 'PLAYER_NOT_FOUND', message } };
}

const normName = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const squashName = (s?: string | null) => normName(s).replace(/ /g, '');

/** "Name#1234" for suffixed modern gamertags, otherwise the gamertag. */
function uniqueName(p: OpenXBLSearchResult): string {
  if (p.uniqueModernGamertag) return p.uniqueModernGamertag;
  if (p.modernGamertag) return p.modernGamertagSuffix ? `${p.modernGamertag}#${p.modernGamertagSuffix}` : p.modernGamertag;
  return p.gamertag ?? '';
}

function profileFromPerson(p: OpenXBLSearchResult, fallbackName: string): PlayerProfile {
  return {
    id: p.xuid!,
    displayName: uniqueName(p) || p.gamertag || fallbackName,
    avatarUrl: normalizeXboxAvatarUrl(p.displayPicRaw),
    platform: 'xbox',
    ...withGamerscore(parseGamerscore(p.gamerScore)),
  };
}

/**
 * /v2/search is a fuzzy people search ("nF Colors" also returns "nF Colors2"), so its
 * first result is not necessarily the account that was asked for. Only an exact
 * match is accepted:
 *  - "Name#1234" must equal a result's unique modern gamertag;
 *  - "Name" matches a classic gamertag or an unsuffixed modern gamertag (case-insensitive),
 *    then a single suffixed "Name#nnnn"; several suffixed matches are ambiguous;
 *  - last, a single match ignoring spaces ("nFColors" -> "nF Colors").
 */
export function pickSearchMatch(query: string, people: OpenXBLSearchResult[]): { match?: OpenXBLSearchResult; ambiguous?: string[] } {
  const q = normName(query);
  const candidates = people.filter(p => p.xuid);
  if (q.includes('#')) {
    return { match: candidates.find(p => normName(uniqueName(p)) === q) };
  }
  const exact = candidates.filter(p => normName(p.gamertag) === q || (normName(p.modernGamertag) === q && !p.modernGamertagSuffix));
  if (exact.length > 0) return { match: exact[0] };
  const suffixed = candidates.filter(p => normName(p.modernGamertag) === q);
  if (suffixed.length === 1) return { match: suffixed[0] };
  if (suffixed.length > 1) return { ambiguous: suffixed.map(uniqueName) };
  const loose = candidates.filter(p => squashName(p.gamertag) === squashName(q) || squashName(p.modernGamertag) === squashName(q));
  if (loose.length === 1) return { match: loose[0] };
  return {};
}

export interface OpenXBLSearchResult {
  xuid?: string;
  gamertag?: string;
  /** /v2/search and /v2/player/summary people entries carry gamerscore as a string. */
  gamerScore?: string;
  modernGamertag?: string;
  modernGamertagSuffix?: string;
  /** Modern gamertag with its suffix ("Name#1234"), or the plain name when there is none. */
  uniqueModernGamertag?: string;
  displayPicRaw?: string;
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

  async resolvePlayer(input: string): Promise<ApiResult<PlayerProfile>> {
    const query = input.trim();

    // XUID input: look it up directly (people hub), no gamertag matching involved.
    if (XBOX_XUID_RE.test(query)) {
      const summary = await this.fetch<{ people?: OpenXBLSearchResult[] }>(`/v2/player/summary/${query}`);
      if (!summary.success) {
        return summary.error.code === 'HTTP_404' ? notFound(`No Xbox account has XUID ${query}`) : summary;
      }
      const person = summary.data.people?.find(p => p.xuid === query);
      return person ? { success: true, data: profileFromPerson(person, query) } : notFound(`No Xbox account has XUID ${query}`);
    }

    // "Name#1234" can only be matched against search results (several accounts share "Name").
    const hasSuffix = query.includes('#');
    if (!hasSuffix) {
      // Exact gamertag lookup (profile service).
      const searchResult = await this.fetch<OpenXBLSearchResult>(`/v2/friends/search?gt=${encodeURIComponent(query)}`);
      if (searchResult.success) {
        const user = searchResult.data.profileUsers?.[0];
        const xuid = searchResult.data.xuid ?? user?.id;
        if (xuid) {
          return {
            success: true,
            data: {
              id: xuid,
              displayName: user?.settings?.find(s => s.id === 'Gamertag')?.value || query,
              avatarUrl: normalizeXboxAvatarUrl(user?.settings?.find(s => s.id === 'GameDisplayPicRaw')?.value),
              platform: 'xbox',
              ...withGamerscore(parseGamerscore(user?.settings?.find(s => s.id === 'Gamerscore')?.value)),
            },
          };
        }
      } else if (searchResult.error.code === 'BUDGET_EXHAUSTED') {
        return searchResult;
      }
      // Not found or throttled by Xbox (the profile service often answers 429): fall back to search.
    }

    const searchTerm = hasSuffix ? query.slice(0, query.indexOf('#')).trim() : query;
    const fuzzyResult = await this.fetch<{ people?: OpenXBLSearchResult[] }>(`/v2/search/${encodeURIComponent(searchTerm)}`);
    if (!fuzzyResult.success) {
      return fuzzyResult;
    }
    const people = fuzzyResult.data.people ?? [];
    const pick = pickSearchMatch(query, people);
    if (pick.match?.xuid) {
      return { success: true, data: profileFromPerson(pick.match, query) };
    }
    if (pick.ambiguous) {
      return {
        success: false,
        error: {
          error: 'Ambiguous gamertag',
          code: 'AMBIGUOUS_GAMERTAG',
          message: `Several Xbox accounts are named "${searchTerm}": ${pick.ambiguous.slice(0, 5).join(', ')}${pick.ambiguous.length > 5 ? ', ...' : ''}. Add the #number (for example ${pick.ambiguous[0]}) or enter the XUID.`,
        },
      };
    }
    const similar = people.filter(p => p.xuid).slice(0, 3).map(p => `${uniqueName(p)} (${Number(p.gamerScore ?? 0).toLocaleString('en-US')} gamerscore)`);
    return notFound(`Gamertag "${query}" not found${similar.length ? `. Did you mean ${similar.join(', ')}?` : ''}`);
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
