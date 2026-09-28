import type { PlayerProfile, Game, Achievement, ApiResult } from '../types';

export interface PlatformAdapter {
  readonly platform: string;
  
  resolvePlayer(identifier: string): Promise<ApiResult<PlayerProfile>>;
  
  getGameLibrary(playerId: string): Promise<ApiResult<Game[]>>;
  
  getGameAchievements(playerId: string, gameId: string): Promise<ApiResult<Achievement[]>>;
}
