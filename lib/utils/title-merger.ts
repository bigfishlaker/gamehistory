import type { Game, NormalizedGame } from '../types';
import { findTitleAlias, getTitleNote } from './title-aliases';
import { mergeAchievementProgress } from './achievements';
import { FORTNITE_GAME_TITLE } from '../fortnite';

export function normalizeTitle(title: string): string {
  // Epic's Battle Royale stats entry is the same game as Xbox/PlayStation "Fortnite".
  if (title === FORTNITE_GAME_TITLE) return 'fortnite';
  // First check if there's an explicit alias (for COD and other series)
  const alias = findTitleAlias(title);
  if (alias) {
    return alias;
  }
  
  // Standard normalization for other titles
  let normalized = title
    .toLowerCase()
    .replace(/[®™©]/g, '') // Remove trademark symbols
    .replace(/^the\s+/i, '') // Remove leading "the"
    .replace(/:/g, '')
    .replace(/'/g, '')
    .replace(/&/g, 'and')
    .replace(/[^\w\s]/g, '') // Remove non-word, non-space characters
    .replace(/\s+/g, ' ')
    .trim();
  
  // Expand common abbreviations
  if (normalized.startsWith('cod ') || normalized.startsWith('cod:')) {
    normalized = normalized.replace(/^cod[:\s]+/, 'call of duty ');
  }
  
  return normalized;
}

function addPlaytime(target: NormalizedGame, game: Game): void {
  if (game.playtimeMinutes === undefined || game.playtimeMinutes === null) {
    return;
  }
  target.playtimeKnown = true;
  target.totalPlaytimeMinutes += game.playtimeMinutes;
  target.playtimeByPlatform[game.platform] =
    (target.playtimeByPlatform[game.platform] ?? 0) + game.playtimeMinutes;
}

export function mergeGames(games: Game[]): NormalizedGame[] {
  const normalized = new Map<string, NormalizedGame>();

  for (const game of games) {
    const key = normalizeTitle(game.title);
    
    const existing = normalized.get(key);
    if (existing) {
      existing.games.push(game);
      addPlaytime(existing, game);
      
      if (game.lastPlayedAt && (!existing.lastPlayedAt || game.lastPlayedAt > existing.lastPlayedAt)) {
        existing.lastPlayedAt = game.lastPlayedAt;
      }
      
      if (!existing.coverUrl && game.coverUrl) {
        existing.coverUrl = game.coverUrl;
      }
    } else {
      const entry: NormalizedGame = {
        normalizedTitle: key,
        games: [game],
        coverUrl: game.coverUrl,
        totalPlaytimeMinutes: 0,
        playtimeKnown: false,
        playtimeByPlatform: {},
        lastPlayedAt: game.lastPlayedAt || new Date(0),
        achievementProgress: { earned: 0, total: 0 },
        note: getTitleNote(key),
      };
      addPlaytime(entry, game);
      normalized.set(key, entry);
    }
  }

  // Achievements: merged only from entries with real data (earned > 0); otherwise
  // unknown ({0, 0}), never a fake "0/N" from a missing/private account.
  for (const entry of normalized.values()) {
    entry.achievementProgress = mergeAchievementProgress(entry.games) ?? { earned: 0, total: 0 };
    const overlap = epicOverlapMinutes(entry);
    if (overlap > 0) entry.totalPlaytimeMinutes -= overlap;
  }

  return Array.from(normalized.values());
}

/**
 * Epic's Fortnite stats are cross-platform (they already include matches played on
 * Xbox/PlayStation), so when a pool has Fortnite from both Epic and a console, the
 * hours overlap. Count the larger of the two sides, never their sum: returns the
 * minutes to subtract from the plain sum (min(epic, others)), 0 when there's no overlap.
 */
export function epicOverlapMinutes(entry: Pick<NormalizedGame, 'playtimeByPlatform'>): number {
  const byPlatform = entry.playtimeByPlatform;
  const epic = byPlatform.epic ?? 0;
  if (epic <= 0) return 0;
  const others = Object.entries(byPlatform).reduce((sum, [p, m]) => (p === 'epic' ? sum : sum + (m ?? 0)), 0);
  return Math.min(epic, others);
}

export type SortOption = 'lastPlayed' | 'playtime' | 'completion' | 'title';
export type FilterOption = 'all' | 'xbox' | 'steam' | 'psn' | 'epic';

export function sortGames(games: NormalizedGame[], sortBy: SortOption): NormalizedGame[] {
  const sorted = [...games];
  
  switch (sortBy) {
    case 'lastPlayed':
      sorted.sort((a, b) => {
        const aTime = new Date(a.lastPlayedAt ?? 0).getTime();
        const bTime = new Date(b.lastPlayedAt ?? 0).getTime();
        return bTime - aTime;
      });
      break;
    case 'playtime':
      // "Most played (combined)": highest stacked minutes first; games with
      // unknown playtime go after every game with known playtime (even 0m).
      sorted.sort((a, b) => {
        if (a.playtimeKnown !== b.playtimeKnown) return a.playtimeKnown ? -1 : 1;
        return b.totalPlaytimeMinutes - a.totalPlaytimeMinutes;
      });
      break;
    case 'completion':
      sorted.sort((a, b) => {
        const aPercent = a.achievementProgress.total > 0
          ? a.achievementProgress.earned / a.achievementProgress.total
          : 0;
        const bPercent = b.achievementProgress.total > 0
          ? b.achievementProgress.earned / b.achievementProgress.total
          : 0;
        return bPercent - aPercent;
      });
      break;
    case 'title':
      sorted.sort((a, b) => a.games[0].title.localeCompare(b.games[0].title));
      break;
  }
  
  return sorted;
}

export function filterGames(games: NormalizedGame[], platform: FilterOption): NormalizedGame[] {
  if (platform === 'all') {
    return games;
  }
  
  return games.filter(game => 
    game.games.some(g => g.platform === platform)
  );
}
