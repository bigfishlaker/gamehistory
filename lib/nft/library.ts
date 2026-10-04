import type { Platform } from '@/lib/types';
import type { ProfileData } from '@/lib/profile/load-profile';
import { mergeGames, sortGames } from '@/lib/utils/title-merger';
import { snapshotFromProfile } from './mint-service';
import { sanitizeCover } from './top6';

/** Trimmed library for the Forge game (top games by hours). `key` is what /api/nft/voucher expects in top6. */
export interface LibraryGame {
  key: string;
  title: string;
  minutes: number;
  platforms: Platform[];
  cover?: string;
}

export interface LibraryResponse {
  displayName: string;
  totalMinutes: number;
  gameCount: number;
  platforms: Platform[];
  games: LibraryGame[];
  errors: string[];
}

export const LIBRARY_LIMIT = 60;
const ORDER: Platform[] = ['xbox', 'steam', 'psn', 'epic'];

export function toLibrary(data: ProfileData, limit = LIBRARY_LIMIT): LibraryResponse {
  const snap = snapshotFromProfile(data);
  const games = sortGames(mergeGames(data.games), 'playtime')
    .slice(0, limit)
    .map(g => ({
      key: g.normalizedTitle,
      title: g.games[0].title,
      minutes: Math.max(0, g.totalPlaytimeMinutes),
      platforms: ORDER.filter(p => g.games.some(x => x.platform === p)),
      ...(sanitizeCover(g.coverUrl) ? { cover: sanitizeCover(g.coverUrl) } : {}),
    }));
  return { displayName: snap.displayName, totalMinutes: snap.totalMinutes, gameCount: snap.gameCount, platforms: snap.platforms, games, errors: Object.values(data.errors).slice(0, 5) };
}
