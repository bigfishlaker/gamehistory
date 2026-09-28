/** 'epic' = Epic Games / Fortnite (Battle Royale stats via fortnite-api.com). */
export type Platform = 'xbox' | 'steam' | 'psn' | 'epic';

export interface PlayerProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  platform: Platform;
  gameCount?: number;
  /** Games on this account with known playtime. */
  gamesWithPlaytime?: number;
  /** Sum of known playtime; undefined when the account has no playtime data at all. */
  totalPlaytimeMinutes?: number;
}

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  coverUrl?: string;
  /** Platform player id (XUID / SteamID64) of the account this entry came from. */
  accountId?: string;
  /** Total minutes played. `undefined` means the platform has no data (unknown), NOT zero. */
  playtimeMinutes?: number;
  lastPlayedAt?: Date;
  achievementProgress?: {
    earned: number;
    total: number;
  };
  /** Platform category/type when known (PSN "ps4_game"/"ps5_native_game", Xbox "Game"/"App"). */
  category?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  iconLockedUrl?: string;
  unlocked: boolean;
  unlockedAt?: Date;
  rarity?: number;
}

export interface GameDetail {
  game: Game;
  achievements: Achievement[];
}

export interface NormalizedGame {
  normalizedTitle: string;
  igdbId?: number;
  games: Game[];
  coverUrl?: string;
  /** Sum of all known playtime across platforms (unknown entries contribute nothing). */
  totalPlaytimeMinutes: number;
  /** True when at least one platform entry has real playtime data. */
  playtimeKnown: boolean;
  /** Per-platform minutes; a platform is present only when it has known data. */
  playtimeByPlatform: Partial<Record<Platform, number>>;
  lastPlayedAt: Date;
  achievementProgress: {
    earned: number;
    total: number;
  };
  /** Optional note about this title (e.g., for launchers like COD HQ) */
  note?: string;
}

export interface PlatformPlaytimeTotal {
  minutes: number;
  /** Games on this platform with known playtime. */
  gamesWithData: number;
  /** Games on this platform with no playtime data (shown as unknown). */
  gamesUnknown: number;
}

export interface CombinedPlaytimeEntry {
  title: string;
  normalizedTitle: string;
  totalMinutes: number;
  byPlatform: Partial<Record<Platform, number>>;
}

export interface PlaytimeSummary {
  /** Grand total of known minutes across all games and platforms. */
  totalMinutes: number;
  byPlatform: Partial<Record<Platform, PlatformPlaytimeTotal>>;
  /** Games ranked by combined minutes (only games with known playtime). */
  topCombined: CombinedPlaytimeEntry[];
}

export interface ErrorResponse {
  error: string;
  code?: string;
  message?: string;
}

export interface RateLimitInfo {
  remaining?: number;
  limit?: number;
  reset?: number;
}

export type ApiResult<T> = 
  | { success: true; data: T; rateLimit?: RateLimitInfo }
  | { success: false; error: ErrorResponse; rateLimit?: RateLimitInfo };
