import type { Game } from '../types';

export interface AchievementProgress {
  earned: number;
  total: number;
}

/**
 * An account's achievement numbers are only trusted when something was actually
 * earned. "0 of N" is what platforms report when the data is missing, private or
 * not synced (e.g. 1,651h of Fortnite on PSN reported as 0/46), so it is treated
 * as unknown rather than shown as a fake 0/N.
 */
export function hasRealAchievementData(p: AchievementProgress | undefined | null): p is AchievementProgress {
  return !!p && p.earned > 0;
}

/**
 * Merge achievement progress across accounts/platform entries, using only the
 * entries with real data. Returns undefined (unknown) when no entry has any.
 * If any contributing entry has an unknown total (0), the merged total is 0
 * (unknown) and only the earned count is shown.
 */
export function mergeAchievementProgress(games: Array<Pick<Game, 'achievementProgress'>>): AchievementProgress | undefined {
  const real = games.map(g => g.achievementProgress).filter(hasRealAchievementData);
  if (real.length === 0) return undefined;
  const earned = real.reduce((s, p) => s + p.earned, 0);
  const total = real.some(p => p.total <= 0) ? 0 : real.reduce((s, p) => s + p.total, 0);
  return { earned, total };
}
