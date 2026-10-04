import { createXboxAdapter, createSteamAdapter, createPSNAdapter, createFortniteAdapter } from '@/lib/adapters';
import { FORTNITE_GAME_ID, FORTNITE_GAME_TITLE, type FortniteStats } from '@/lib/fortnite';
import { PSN_UNAVAILABLE_MESSAGE } from '@/lib/adapters/psn-adapter';
import { xboxEmptyHistoryMessage } from '@/lib/adapters/xbox-adapter';
import { getCache, PROFILE_CACHE_TTL_SECONDS, XBOX_EMPTY_HISTORY_CACHE_TTL_SECONDS } from '@/lib/cache';
import { reviveGameArrayDates } from '@/lib/utils/date-reviver';
import { summarizePlaytime } from '@/lib/utils/playtime';
import { filterNonGames } from '@/lib/utils/non-game';
import { dedupe, BUSY_MESSAGE } from '@/lib/rate-limit';
import { userSafeError } from '@/lib/utils/safe-error';
import type { PlayerProfile, Game, PlaytimeSummary } from '@/lib/types';

/** Already normalized, validated and de-duplicated account identifiers. */
export interface ProfileInput {
  xbox: string[];
  steam: string[];
  psn: string[];
  epic: string[];
}

export interface ProfileData {
  profiles: PlayerProfile[];
  games: Game[];
  playtime: PlaytimeSummary;
  errors: Record<string, string>;
  /** True when some Xbox data was skipped because the hourly OpenXBL budget is nearly used. */
  busy?: boolean;
  /** Fortnite Battle Royale stats per Epic account id (for the Fortnite card). */
  fortnite?: Record<string, FortniteStats>;
}

/** Fortnite stats (and "private"/"not found" answers) are cached for 15 minutes. */
const FORTNITE_CACHE_TTL_SECONDS = 15 * 60;

interface AccountLoad {
  profile?: PlayerProfile;
  games: Game[];
  errors: Record<string, string>;
  busy?: boolean;
  fortnite?: FortniteStats;
}

/**
 * Loads and merges the given accounts (cached ~1h per account, concurrent loads collapsed).
 * Shared by GET /api/profile and the server-side GAMER.ID Card routes, which must not trust
 * client-supplied game data.
 */
export async function loadProfileData(input: ProfileInput): Promise<ProfileData> {
  const cache = getCache();
  const profiles: PlayerProfile[] = [];
  const games: Game[] = [];
  const errors: Record<string, string> = {};
  const profileIdToGames: Map<string, Game[]> = new Map();
  let busy = false;

  // Tag each game with the account it came from (needed for per-account achievements),
  // and ignore an account that resolves to one already added (e.g. vanity name + SteamID64).
  const addAccount = (profile: PlayerProfile, accountGames: Game[]) => {
    if (profileIdToGames.has(profile.id)) return;
    // Apps (SHAREfactory, EA Play Hub, Minecraft Launcher, media players...) are not
    // games: drop them before counts, totals and the Top N are computed.
    const tagged = filterNonGames(accountGames).map(g => ({ ...g, accountId: profile.id }));
    profiles.push(profile);
    profileIdToGames.set(profile.id, tagged);
    games.push(...tagged);
  };

  const errText = (e: { message?: string; error: string; code?: string }) =>
    e.code === 'BUDGET_EXHAUSTED' ? (e.message || BUSY_MESSAGE) : userSafeError(e.message || e.error);
  const isBusy = (e: { code?: string }) => e.code === 'BUDGET_EXHAUSTED';

  // Each account load is cached (~1h, shared store) and concurrent identical
  // loads are collapsed into one upstream fetch (dedupe).
  const loadXbox = (gamertag: string) => {
    const cacheKey = `xbox:profile:v2:${gamertag.toLowerCase()}`;
    return dedupe<AccountLoad>(cacheKey, async () => {
      const emptyHistory = (profile: PlayerProfile): AccountLoad => ({
        profile, games: [],
        errors: { [`xbox-${gamertag}-games`]: xboxEmptyHistoryMessage(profile.gamerscore) },
      });
      const cached = await cache.get<{ profile: PlayerProfile; games: Game[] }>(cacheKey);
      if (cached) {
        // An empty title history is never shown as a silent "0 games" (includes entries cached before this check).
        if (!cached.games?.length) return emptyHistory(cached.profile);
        return { profile: cached.profile, games: reviveGameArrayDates(cached.games), errors: {} };
      }
      const xbox = createXboxAdapter();
      if (!xbox) return { games: [], errors: { [`xbox-${gamertag}`]: 'Xbox API key not configured' } };

      const profileResult = await xbox.resolvePlayer(gamertag);
      if (!profileResult.success) {
        return { games: [], errors: { [`xbox-${gamertag}`]: errText(profileResult.error) }, busy: profileResult.error.code === 'BUDGET_EXHAUSTED' };
      }
      const gamesResult = await xbox.getGameLibrary(profileResult.data.id);
      if (!gamesResult.success) {
        return {
          profile: profileResult.data, games: [],
          errors: { [`xbox-${gamertag}-games`]: errText(gamesResult.error) },
          busy: gamesResult.error.code === 'BUDGET_EXHAUSTED',
        };
      }
      let xboxGames = gamesResult.data;
      if (xboxGames.length === 0) {
        // Xbox answers 200 + empty titles (not 403) when game history is hidden.
        await cache.set(cacheKey, { profile: profileResult.data, games: [] }, XBOX_EMPTY_HISTORY_CACHE_TTL_SECONDS);
        return emptyHistory(profileResult.data);
      }
      const playtimeResult = await xbox.getTitlePlaytimes(profileResult.data.id, xboxGames.map(g => g.id));
      if (!playtimeResult.success) {
        const why = playtimeResult.error.code === 'BUDGET_EXHAUSTED'
          ? BUSY_MESSAGE
          : userSafeError(playtimeResult.error.message, 'Xbox Live request failed.');
        return {
          profile: profileResult.data, games: xboxGames,
          errors: { [`xbox-${gamertag}-playtime`]: `Xbox playtime is unavailable right now, so hours for this account aren't counted. (${why})` },
          busy: playtimeResult.error.code === 'BUDGET_EXHAUSTED',
        };
      }
      const minutesByTitle = playtimeResult.data;
      xboxGames = xboxGames.map(g => (minutesByTitle[g.id] !== undefined ? { ...g, playtimeMinutes: minutesByTitle[g.id] } : g));
      // Only complete results are cached, so a failed playtime call is retried next time.
      await cache.set(cacheKey, { profile: profileResult.data, games: xboxGames }, PROFILE_CACHE_TTL_SECONDS);
      return { profile: profileResult.data, games: xboxGames, errors: {} };
    });
  };

  const loadSteam = (steamId: string) => {
    const cacheKey = `steam:profile:${steamId}`;
    return dedupe<AccountLoad>(cacheKey, async () => {
      const cached = await cache.get<{ profile: PlayerProfile; games: Game[] }>(cacheKey);
      if (cached) return { profile: cached.profile, games: reviveGameArrayDates(cached.games), errors: {} };
      const steam = createSteamAdapter();
      if (!steam) return { games: [], errors: { [`steam-${steamId}`]: 'Steam API key not configured' } };
      const profileResult = await steam.resolvePlayer(steamId);
      if (!profileResult.success) return { games: [], errors: { [`steam-${steamId}`]: errText(profileResult.error) }, busy: isBusy(profileResult.error) };
      const gamesResult = await steam.getGameLibrary(profileResult.data.id);
      if (!gamesResult.success) {
        return { profile: profileResult.data, games: [], errors: { [`steam-${steamId}-games`]: errText(gamesResult.error) }, busy: isBusy(gamesResult.error) };
      }
      await cache.set(cacheKey, { profile: profileResult.data, games: gamesResult.data }, PROFILE_CACHE_TTL_SECONDS);
      return { profile: profileResult.data, games: gamesResult.data, errors: {} };
    });
  };

  const loadPsn = (onlineId: string) => {
    const cacheKey = `psn:profile:${onlineId.toLowerCase()}`;
    return dedupe<AccountLoad>(cacheKey, async () => {
      const cached = await cache.get<{ profile: PlayerProfile; games: Game[] }>(cacheKey);
      if (cached) return { profile: cached.profile, games: reviveGameArrayDates(cached.games), errors: {} };
      const psn = createPSNAdapter();
      if (!psn) {
        console.error('[psn] PSN_NPSSO is not configured; PSN lookups are disabled');
        return { games: [], errors: { [`psn-${onlineId}`]: PSN_UNAVAILABLE_MESSAGE } };
      }
      const profileResult = await psn.resolvePlayer(onlineId);
      if (!profileResult.success) return { games: [], errors: { [`psn-${onlineId}`]: errText(profileResult.error) }, busy: isBusy(profileResult.error) };
      const gamesResult = await psn.getGameLibrary(profileResult.data.id);
      if (!gamesResult.success) {
        return { profile: profileResult.data, games: [], errors: { [`psn-${onlineId}-games`]: errText(gamesResult.error) }, busy: isBusy(gamesResult.error) };
      }
      await cache.set(cacheKey, { profile: profileResult.data, games: gamesResult.data }, PROFILE_CACHE_TTL_SECONDS);
      return { profile: profileResult.data, games: gamesResult.data, errors: {} };
    });
  };

  const loadEpic = (name: string) => {
    const cacheKey = `fortnite:v1:${name.toLowerCase()}`;
    type Cached = { stats?: FortniteStats; error?: { message: string; code?: string } };
    return dedupe<AccountLoad>(cacheKey, async () => {
      const errKey = `epic-${name}`;
      const toLoad = (stats: FortniteStats): AccountLoad => ({
        profile: { id: stats.accountId, displayName: stats.name, platform: 'epic' },
        games: [{
          id: FORTNITE_GAME_ID,
          title: FORTNITE_GAME_TITLE,
          platform: 'epic',
          playtimeMinutes: stats.overall.minutesPlayed,
          ...(stats.lastModified ? { lastPlayedAt: new Date(stats.lastModified) } : {}),
          category: 'Game',
        }],
        errors: {},
        fortnite: stats,
      });
      const cached = await cache.get<Cached>(cacheKey);
      if (cached?.stats) return toLoad(cached.stats);
      if (cached?.error) return { games: [], errors: { [errKey]: cached.error.message } };
      const fortnite = createFortniteAdapter();
      if (!fortnite) {
        console.error('[fortnite] FORTNITE_API_KEY is not configured; Fortnite lookups are disabled');
        return { games: [], errors: { [errKey]: 'Fortnite stats are unavailable right now. Please try again later.' } };
      }
      const result = await fortnite.getStats(name);
      if (result.success) {
        await cache.set<Cached>(cacheKey, { stats: result.data }, FORTNITE_CACHE_TTL_SECONDS);
        return toLoad(result.data);
      }
      const code = result.error.code;
      const message = errText(result.error);
      // Private / not found answers are stable: cache them too so repeats don't spend quota.
      if (code === 'PRIVATE_PROFILE' || code === 'PLAYER_NOT_FOUND') {
        await cache.set<Cached>(cacheKey, { error: { message, code } }, FORTNITE_CACHE_TTL_SECONDS);
      }
      return { games: [], errors: { [errKey]: message }, busy: isBusy(result.error) };
    });
  };

  // Sequential on purpose: keeps Xbox calls ordered and the per-request cost predictable.
  const loads: AccountLoad[] = [];
  for (const tag of input.xbox) loads.push(await loadXbox(tag));
  for (const id of input.steam) loads.push(await loadSteam(id));
  for (const id of input.psn) loads.push(await loadPsn(id));
  for (const name of input.epic) loads.push(await loadEpic(name));
  const fortniteStats: Record<string, FortniteStats> = {};

  for (const load of loads) {
    if (load.profile) addAccount(load.profile, load.games);
    Object.assign(errors, load.errors);
    if (load.busy) busy = true;
    if (load.fortnite && load.profile) fortniteStats[load.profile.id] = load.fortnite;
  }

  // Attach per-account stats to profiles
  const profilesWithStats = profiles.map(profile => {
    const accountGameList = profileIdToGames.get(profile.id) || [];
    const known = accountGameList.filter(g => g.playtimeMinutes !== undefined && g.playtimeMinutes !== null);
    // An account with no playtime data at all (e.g. an account whose titles are all
    // Xbox 360, which has no MinutesPlayed stat) is "unknown", not 0 minutes.
    const totalMinutes = known.length > 0 ? known.reduce((sum, g) => sum + (g.playtimeMinutes ?? 0), 0) : undefined;

    return {
      ...profile,
      gameCount: accountGameList.length,
      gamesWithPlaytime: known.length,
      totalPlaytimeMinutes: totalMinutes,
    };
  });

  const data: ProfileData = {
    profiles: profilesWithStats,
    games,
    playtime: summarizePlaytime(games, 10),
    errors,
    ...(busy ? { busy: true } : {}),
    ...(Object.keys(fortniteStats).length ? { fortnite: fortniteStats } : {}),
  };

  return data;
}
