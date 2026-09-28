import type { Game, Achievement } from '../types';

export function reviveGameDates(game: Game): Game {
  return {
    ...game,
    lastPlayedAt: game.lastPlayedAt ? new Date(game.lastPlayedAt) : undefined,
  };
}

export function reviveAchievementDates(achievement: Achievement): Achievement {
  return {
    ...achievement,
    unlockedAt: achievement.unlockedAt ? new Date(achievement.unlockedAt) : undefined,
  };
}

export function reviveGameArrayDates(games: Game[]): Game[] {
  return games.map(reviveGameDates);
}

export function reviveAchievementArrayDates(achievements: Achievement[]): Achievement[] {
  return achievements.map(reviveAchievementDates);
}
