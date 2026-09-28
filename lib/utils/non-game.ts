import type { Game } from '../types';

/**
 * Apps that show up in Xbox title history / PSN played lists / Steam libraries
 * but are not games: media players, TV/streaming, launchers, hubs, share/capture
 * tools and runtimes. They are dropped from games, totals and the Top N.
 *
 * Matching is on a normalized title (lowercase, no ®/™/©, collapsed spaces) and
 * is exact or anchored, so game titles such as "JD Disney Party" or
 * "Call of Duty®" (Steam CoD HQ, which holds real MW2/MW3/BO6 hours) survive.
 */
const EXACT = new Set([
  // Sony
  'sharefactory', 'share factory studio', 'sharefactory studio', 'live from playstation', 'playstation video',
  'playstation music', 'playstation vue', 'playstation now', 'playstation plus', 'playstation app', 'media player',
  'tv & video', 'internet browser', 'web browser', 'playstation store', 'playroom', 'the playroom',
  // Microsoft / Xbox
  'xbox app', 'xbox', 'xbox console companion', 'xbox game bar', 'xbox identity provider', 'xbox family settings',
  'xbox accessories', 'xbox avatars', 'xbox avatar editor', 'xbox game pass', 'xbox insider hub', 'xbox guide',
  'microsoft store', 'microsoft edge', 'internet explorer', 'movies & tv', 'films & tv', 'groove music', 'skype',
  'mixer', 'blu-ray player', 'microsoft solitaire collection launcher',
  // Launchers / hubs
  'ea play hub', 'ea play', 'ea app', 'ea desktop', 'origin', 'minecraft launcher', 'battle.net', 'ubisoft connect',
  'uplay', 'epic games launcher', 'rockstar games launcher', 'bethesda.net launcher', 'steam', 'steamvr',
  'wallpaper engine', 'itch.io',
  // Media / streaming
  'netflix', 'youtube', 'youtube tv', 'hulu', 'disney+', 'disney plus', 'prime video', 'amazon prime video',
  'amazon video', 'spotify', 'spotify music', 'twitch', 'plex', 'hbo max', 'hbo go', 'max', 'crunchyroll', 'apple tv',
  'apple tv+', 'peacock', 'paramount+', 'vudu', 'sling tv', 'pluto tv', 'espn', 'tubi', 'funimation', 'discord',
  'iheartradio', 'pandora', 'vlc', 'kodi', 'nba tv', 'nfl', 'dazn', 'mlb.tv', 'fubotv', 'amazon music', 'tidal',
  'deezer', 'napster', 'showtime', 'starz', 'britbox', 'bbc iplayer', 'all 4', 'my5', 'itv hub', 'itvx', 'now tv',
]);

const PATTERNS: RegExp[] = [
  /^sharefactory/,
  /redistributables?$/,
  /^steamworks common/,
  /^steam linux runtime/,
  /^proton( |$)/,
  /^source sdk/,
  / dedicated server$/,
  / launcher$/, // "Minecraft Launcher", "Rockstar Games Launcher" (games are never named "X Launcher")
  / hub$/, // "EA Play Hub", "Xbox Insider Hub"
];

export function normalizeAppTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** PSN categories / Xbox title types that are apps, not games. */
function isAppCategory(category: string | undefined): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return c === 'app' || /videoservice|web_app|_app$|application/.test(c);
}

export function isNonGame(game: Pick<Game, 'title'> & { category?: string }): boolean {
  if (isAppCategory(game.category)) return true;
  const t = normalizeAppTitle(game.title);
  if (EXACT.has(t)) return true;
  return PATTERNS.some(p => p.test(t));
}

export function filterNonGames<T extends Pick<Game, 'title'> & { category?: string }>(games: T[]): T[] {
  return games.filter(g => !isNonGame(g));
}
