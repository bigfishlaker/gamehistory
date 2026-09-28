import type { Game, Platform, PlaytimeSummary, PlatformPlaytimeTotal } from '../types';
import { mergeGames, sortGames, epicOverlapMinutes } from './title-merger';

export function hasPlaytime(game: Game): boolean {
  return game.playtimeMinutes !== undefined && game.playtimeMinutes !== null;
}

/**
 * Stack playtime across platforms: per-platform totals, a grand total, and a
 * ranking of games by combined minutes. Games without playtime data are counted
 * as unknown and never treated as 0.
 */
export function summarizePlaytime(games: Game[], topN = 10): PlaytimeSummary {
  const byPlatform: Partial<Record<Platform, PlatformPlaytimeTotal>> = {};

  for (const game of games) {
    const bucket = (byPlatform[game.platform] ??= { minutes: 0, gamesWithData: 0, gamesUnknown: 0 });
    if (hasPlaytime(game)) {
      bucket.minutes += game.playtimeMinutes!;
      bucket.gamesWithData += 1;
    } else {
      bucket.gamesUnknown += 1;
    }
  }

  const merged = mergeGames(games);
  // Fortnite from Epic overlaps console Fortnite hours: count the larger side only.
  const overlap = merged.reduce((sum, g) => sum + epicOverlapMinutes(g), 0);
  const totalMinutes = Object.values(byPlatform).reduce((sum, p) => sum + (p?.minutes ?? 0), 0) - overlap;

  const topCombined = sortGames(merged, 'playtime')
    .filter(g => g.playtimeKnown && g.totalPlaytimeMinutes > 0)
    .slice(0, topN)
    .map(g => ({
      title: g.games[0].title,
      normalizedTitle: g.normalizedTitle,
      totalMinutes: g.totalPlaytimeMinutes,
      byPlatform: g.playtimeByPlatform,
    }));

  return { totalMinutes, byPlatform, topCombined };
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: hours < 10 ? 1 : 0 })}h`;
}
