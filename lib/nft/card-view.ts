import type { Platform } from '@/lib/types';
import type { KVStore } from '@/lib/store';
import type { ProfileData, ProfileInput } from '@/lib/profile/load-profile';
import { snapshotFromProfile, type CardRecord, type CardSnapshot } from './mint-service';
import { parseTop6Json, type Top6Entry } from './top6';
import { tierForHours, type Tier } from './tier';

export interface CardView {
  tokenId: string;
  serial: string;
  displayName: string;
  totalHours: number;
  gameCount: number;
  platforms: Platform[];
  tier: Tier;
  top6: Top6Entry[];
  mintedAt: number;
  chainId: number;
  owner: string;
  /** True when hours/games are live, false when showing the at-mint snapshot. */
  live: boolean;
}

const STATS_TTL_SECONDS = 6 * 3600;
const statsKey = (chainId: number, tokenId: string) => `nft:stats:${chainId}:${tokenId}`;

export function formatSerial(tokenId: string | bigint): string {
  return `#${tokenId.toString().padStart(6, '0')}`;
}

/**
 * Hours, games and tier stay dynamic (recomputed from the linked accounts, cached 6h);
 * the Top 6 is locked forever. Falls back to the at-mint snapshot if a platform is down.
 */
export async function liveStats(
  store: KVStore,
  card: CardRecord,
  loadProfile: (i: ProfileInput) => Promise<ProfileData>,
): Promise<{ stats: CardSnapshot; live: boolean }> {
  const key = statsKey(card.chainId, card.tokenId);
  const cached = await store.get<CardSnapshot>(key).catch(() => null);
  if (cached) return { stats: cached, live: true };
  try {
    const data = await loadProfile(card.inputs);
    if (data.profiles.length === 0) throw new Error('no profiles');
    const stats = snapshotFromProfile(data);
    // Never show fewer hours than at mint because an account failed to load this time.
    if (stats.totalMinutes < card.snapshot.totalMinutes && Object.keys(data.errors).length) throw new Error('partial');
    await store.set(key, stats, STATS_TTL_SECONDS).catch(() => {});
    return { stats, live: true };
  } catch {
    return { stats: card.snapshot, live: false };
  }
}

export function toCardView(card: CardRecord, stats: CardSnapshot, live: boolean): CardView {
  const totalHours = Math.floor(stats.totalMinutes / 60);
  return {
    tokenId: card.tokenId,
    serial: formatSerial(card.tokenId),
    displayName: card.snapshot.displayName,
    totalHours,
    gameCount: stats.gameCount,
    platforms: stats.platforms,
    tier: tierForHours(totalHours),
    top6: parseTop6Json(card.top6Json)?.top6 ?? [],
    mintedAt: card.mintedAt,
    chainId: card.chainId,
    owner: card.owner,
    live,
  };
}

const PLATFORM_LABEL: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation', epic: 'Epic Games' };

/** ERC-721 metadata JSON (OpenSea-style attributes). */
export function cardMetadata(view: CardView, origin: string) {
  return {
    name: `GAMER.ID ${view.serial}`,
    description:
      `${view.displayName}'s GAMER.ID Card: ${view.totalHours.toLocaleString('en-US')} hours across ${view.gameCount} games. ` +
      'Soulbound. The Top 6 was locked in at mint; hours, games and tier update from GAMER.ID.',
    image: `${origin}/api/nft/${view.tokenId}/image?h=${view.totalHours}`,
    external_url: `${origin}/mint/card/${view.tokenId}`,
    attributes: [
      { trait_type: 'Tier', value: view.tier.name },
      { trait_type: 'Total Hours', value: view.totalHours, display_type: 'number' },
      { trait_type: 'Games', value: view.gameCount, display_type: 'number' },
      { trait_type: 'Platforms', value: view.platforms.map(p => PLATFORM_LABEL[p]).join(', ') || 'None' },
      ...view.platforms.map(p => ({ trait_type: 'Platform', value: PLATFORM_LABEL[p] })),
      ...view.top6.map((g, i) => ({ trait_type: `Top ${i + 1}`, value: g.t })),
      { trait_type: 'Minted', value: Math.floor(view.mintedAt / 1000), display_type: 'date' },
      { trait_type: 'Soulbound', value: 'Yes' },
    ],
  };
}
