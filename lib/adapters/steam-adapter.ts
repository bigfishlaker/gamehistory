import type { PlatformAdapter } from './platform-adapter';
import { COD_HQ_STEAM_APPID, COD_HQ_TITLE } from '../utils/title-aliases';
import type { PlayerProfile, Game, Achievement, ApiResult } from '../types';
import { normalizeSteamInput, STEAM_NOT_FOUND_MESSAGE } from '../utils/steam-parser';

interface SteamVanityResponse {
  response: {
    steamid?: string;
    success: number;
  };
}

interface SteamPlayerSummary {
  response: {
    players: Array<{
      steamid: string;
      personaname: string;
      avatarfull?: string;
      communityvisibilitystate?: number;
    }>;
  };
}

interface SteamOwnedGames {
  response: {
    games?: Array<{
      appid: number;
      name: string;
      playtime_forever: number;
      playtime_2weeks?: number;
      rtime_last_played?: number;
      img_icon_url?: string;
      has_community_visible_stats?: boolean;
    }>;
  };
}

interface SteamAchievements {
  playerstats?: {
    achievements?: Array<{
      apiname: string;
      achieved: number;
      unlocktime: number;
      name?: string;
      description?: string;
    }>;
  };
}

interface SteamAchievementSchema {
  game?: {
    availableGameStats?: {
      achievements?: Array<{
        name: string;
        displayName: string;
        description?: string;
        icon?: string;
        icongray?: string;
      }>;
    };
  };
}

export class SteamAdapter implements PlatformAdapter {
  readonly platform = 'steam';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.steampowered.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private buildUrl(path: string, params: Record<string, string | number>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('key', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  private async fetch<T>(url: string): Promise<ApiResult<T>> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        return {
          success: false,
          error: {
            error: 'API error',
            code: `HTTP_${response.status}`,
            // Never surface the upstream body (Steam returns HTML error pages).
            message: `Steam API request failed (HTTP ${response.status}).`,
          },
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: {
          error: 'Network error',
          message: "Couldn't reach Steam. Please try again shortly.",
        },
      };
    }
  }

  async resolvePlayer(identifier: string): Promise<ApiResult<PlayerProfile>> {
    const notFound: ApiResult<PlayerProfile> = {
      success: false,
      error: { error: 'Not found', code: 'PLAYER_NOT_FOUND', message: STEAM_NOT_FOUND_MESSAGE },
    };

    const input = normalizeSteamInput(identifier);
    if (!input) {
      return notFound;
    }

    let steamId = input.value;
    if (input.kind === 'vanity') {
      const vanityUrl = this.buildUrl('/ISteamUser/ResolveVanityURL/v1/', {
        vanityurl: input.value,
      });
      const vanityResult = await this.fetch<SteamVanityResponse>(vanityUrl);
      const resolved = vanityResult.success ? vanityResult.data.response : undefined;

      if (!resolved || resolved.success !== 1 || !resolved.steamid || !/^\d{17}$/.test(resolved.steamid)) {
        return notFound;
      }

      steamId = resolved.steamid;
    }

    const summaryUrl = this.buildUrl('/ISteamUser/GetPlayerSummaries/v2/', {
      steamids: steamId,
    });
    const summaryResult = await this.fetch<SteamPlayerSummary>(summaryUrl);
    
    if (!summaryResult.success) {
      return summaryResult;
    }

    const player = summaryResult.data.response.players?.[0];
    if (!player) {
      return notFound;
    }

    if (player.communityvisibilitystate !== 3) {
      return {
        success: false,
        error: {
          error: 'Private profile',
          code: 'PRIVATE_PROFILE',
          message: 'This Steam profile is not public. Change "Game details" to "Public" in Privacy Settings.',
        },
      };
    }

    return {
      success: true,
      data: {
        id: steamId,
        displayName: player.personaname,
        avatarUrl: player.avatarfull,
        platform: 'steam',
      },
    };
  }

  async getGameLibrary(steamId: string): Promise<ApiResult<Game[]>> {
    const url = this.buildUrl('/IPlayerService/GetOwnedGames/v1/', {
      steamid: steamId,
      include_appinfo: 1,
      include_played_free_games: 1,
    });

    const result = await this.fetch<SteamOwnedGames>(url);
    if (!result.success) {
      return result;
    }

    if (!result.data.response.games) {
      return {
        success: false,
        error: {
          error: 'Private profile',
          code: 'PRIVATE_PROFILE',
          message: 'Game details are private. Change "Game details" to "Public" in Privacy Settings.',
        },
      };
    }

    const games = result.data.response.games.map(game => ({
      id: String(game.appid),
      // Label the CoD HQ launcher so its (real) hours aren't mistaken for the 2003 game.
      title: String(game.appid) === COD_HQ_STEAM_APPID ? COD_HQ_TITLE : game.name,
      platform: 'steam' as const,
      coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900_2x.jpg`,
      playtimeMinutes: game.playtime_forever,
      lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : undefined,
      // GetOwnedGames has no achievement counts. The old { earned: 0, total: 0 }
      // placeholder showed as "0 achievements" for every game with stats; leave it
      // unknown (undefined) instead.
      achievementProgress: undefined,
    }));

    return { success: true, data: games };
  }

  async getGameAchievements(steamId: string, appId: string): Promise<ApiResult<Achievement[]>> {
    const schemaUrl = this.buildUrl('/ISteamUserStats/GetSchemaForGame/v2/', {
      appid: appId,
    });
    const schemaResult = await this.fetch<SteamAchievementSchema>(schemaUrl);
    
    const schema = schemaResult.success
      ? schemaResult.data.game?.availableGameStats?.achievements || []
      : [];

    const achievementsUrl = this.buildUrl('/ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: steamId,
      appid: appId,
    });
    const achievementsResult = await this.fetch<SteamAchievements>(achievementsUrl);
    
    if (!achievementsResult.success) {
      // Previously this fell back to the schema with every achievement marked
      // locked, which reported false data (e.g. 520/520 locked for a private
      // profile). Surface the real reason instead.
      const isPrivate = achievementsResult.error.code === 'HTTP_403';
      return {
        success: false,
        error: {
          error: isPrivate ? 'Private profile' : achievementsResult.error.error,
          code: isPrivate ? 'PRIVATE_PROFILE' : achievementsResult.error.code,
          message: isPrivate
            ? 'This player\'s Steam achievements are private (Game details must be Public).'
            : achievementsResult.error.message,
        },
      };
    }

    const playerAchievements = achievementsResult.data.playerstats?.achievements || [];
    const schemaMap = new Map(schema.map(ach => [ach.name, ach]));

    const achievements = playerAchievements.map(ach => {
      const schemaData = schemaMap.get(ach.apiname);
      return {
        id: ach.apiname,
        name: schemaData?.displayName || ach.name || ach.apiname,
        description: schemaData?.description || ach.description || '',
        iconUrl: schemaData?.icon,
        iconLockedUrl: schemaData?.icongray,
        unlocked: ach.achieved === 1,
        unlockedAt: ach.unlocktime > 0 ? new Date(ach.unlocktime * 1000) : undefined,
      };
    });

    return { success: true, data: achievements };
  }
}
