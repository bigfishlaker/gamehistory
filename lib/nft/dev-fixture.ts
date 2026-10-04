import type { Game } from '@/lib/types';
import type { ProfileData, ProfileInput } from '@/lib/profile/load-profile';

/**
 * Offline library for local development and screenshots (NFT_DEV_FIXTURES=1, never in production).
 * Covers are public Steam CDN header images.
 */
const STEAM = (appId: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
const GAMES: Array<[string, Game['platform'], number, number]> = [
  ['ELDEN RING', 'steam', 1245240, 412],
  ['Counter-Strike 2', 'steam', 730, 1890],
  ['Halo: The Master Chief Collection', 'xbox', 976730, 655],
  ['Red Dead Redemption 2', 'steam', 1174180, 238],
  ['Cyberpunk 2077', 'steam', 1091500, 181],
  ['Baldur\'s Gate 3', 'steam', 1086940, 297],
  ['The Witcher 3: Wild Hunt', 'steam', 292030, 166],
  ['Hades', 'steam', 1145360, 92],
  ['Forza Horizon 5', 'xbox', 1551360, 140],
  ['Sea of Thieves', 'xbox', 1172620, 210],
  ['Portal 2', 'steam', 620, 38],
  ['Stardew Valley', 'steam', 413150, 120],
  ['Rocket League', 'steam', 252950, 520],
  ['Grand Theft Auto V', 'steam', 271590, 333],
  ['Destiny 2', 'steam', 1085660, 760],
  ['Apex Legends', 'steam', 1172470, 444],
];

export function fixtureProfile(input: ProfileInput): ProfileData {
  const profiles = [
    ...input.xbox.map(t => ({ id: `fixture-xbox-${t.toLowerCase()}`, displayName: t, platform: 'xbox' as const })),
    ...input.steam.map(s => ({ id: `fixture-steam-${s}`, displayName: s, platform: 'steam' as const })),
    ...input.psn.map(s => ({ id: `fixture-psn-${s.toLowerCase()}`, displayName: s, platform: 'psn' as const })),
    ...input.epic.map(s => ({ id: `fixture-epic-${s.toLowerCase()}`, displayName: s, platform: 'epic' as const })),
  ];
  const have = new Set(profiles.map(p => p.platform));
  const games: Game[] = GAMES.filter(([, p]) => have.has(p) || have.size === 0 || (p === 'xbox' ? have.has('xbox') : have.has('steam') || have.has('psn') || have.has('epic')))
    .map(([title, platform, appId, hours]) => ({
      id: `${platform}-${appId}`, title, platform: have.has(platform) ? platform : [...have][0], coverUrl: STEAM(appId), playtimeMinutes: hours * 60,
      accountId: profiles[0]?.id,
    }));
  return { profiles, games, playtime: { totalMinutes: 0, byPlatform: {}, topCombined: [] }, errors: {} };
}

export function devFixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NFT_DEV_FIXTURES === '1' && env.NODE_ENV !== 'production';
}
