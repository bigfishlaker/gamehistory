/**
 * Epic / Fortnite Battle Royale stats (fortnite-api.com, unofficial).
 * Shared by the server adapter and the client card (no secrets here).
 */

export const FORTNITE_GAME_ID = 'fortnite-br';
export const FORTNITE_GAME_TITLE = 'Fortnite (Battle Royale stats)';
/** Solo, duo and squad only: fortnite-api's "trio" bucket is always empty. */
export const FORTNITE_MODES = ['solo', 'duo', 'squad'] as const;
export type FortniteMode = (typeof FORTNITE_MODES)[number];

export const FORTNITE_PRIVATE_MESSAGE =
  "This player's Fortnite stats are private — in Fortnite: Settings > Account and Privacy > Show on Career Leaderboard";
export const FORTNITE_BUSY_MESSAGE =
  'GAMER.ID is busy right now: the Fortnite stats lookup limit is used up. Please try again in a few minutes.';
export const fortniteNotFoundMessage = (name: string) => `Epic account "${name}" not found. Check the Epic display name.`;
export const fortniteNoMatchesMessage = (name: string) =>
  `Epic account "${name}" not found with Battle Royale stats (no matches played yet).`;

export interface FortniteModeStats {
  matches: number;
  wins: number;
  /** Percent, 0-100. */
  winRate: number;
  kills: number;
  deaths: number;
  kd: number;
  minutesPlayed: number;
}

export interface FortniteStats {
  accountId: string;
  name: string;
  overall: FortniteModeStats;
  modes: Partial<Record<FortniteMode, FortniteModeStats>>;
  /** ISO timestamp of the last stats update, when known. */
  lastModified?: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function modeStats(raw: unknown): FortniteModeStats | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const matches = num(r.matches);
  const wins = num(r.wins);
  const kills = num(r.kills);
  const deaths = num(r.deaths);
  return {
    matches,
    wins,
    winRate: matches > 0 ? Math.round((wins / matches) * 1000) / 10 : 0,
    kills,
    deaths,
    kd: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills,
    minutesPlayed: num(r.minutesPlayed),
  };
}

/** Parse a fortnite-api.com /v2/stats/br/v2 body. Returns null when the shape is unusable. */
export function parseFortniteStats(body: unknown): FortniteStats | null {
  const data = (body as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
  const account = data?.account as { id?: unknown; name?: unknown } | undefined;
  const all = (data?.stats as { all?: Record<string, unknown> } | undefined)?.all;
  if (!account || typeof account.id !== 'string' || typeof account.name !== 'string' || !all) return null;
  const overall = modeStats(all.overall);
  if (!overall) return null;
  const modes: FortniteStats['modes'] = {};
  for (const m of FORTNITE_MODES) {
    const s = modeStats(all[m]);
    if (s && s.matches > 0) modes[m] = s;
  }
  const lm = (all.overall as Record<string, unknown>).lastModified;
  const lastModified = typeof lm === 'string' && !Number.isNaN(Date.parse(lm)) ? lm : undefined;
  return { accountId: account.id, name: account.name, overall, modes, ...(lastModified ? { lastModified } : {}) };
}

/** Epic display names: 3-16 characters; letters, digits, spaces and . _ - ' ~ ! */
export const EPIC_NAME_RE = /^[\p{L}\p{N} ._'~!-]{3,16}$/u;

export function validateEpicName(name: string): { valid: boolean; error?: string } {
  if (typeof name !== 'string' || !name.trim()) return { valid: false, error: 'Epic display name is required' };
  const trimmed = name.trim();
  if (!EPIC_NAME_RE.test(trimmed)) {
    return { valid: false, error: "Invalid Epic display name (3-16 characters: letters, numbers, spaces and . _ - ' ~ !)" };
  }
  return { valid: true };
}

/** Trim and collapse inner whitespace (names are matched case-insensitively upstream). */
export function normalizeEpicInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function fortniteHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}
