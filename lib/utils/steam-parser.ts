export function parseSteamIdentifier(input: string): string {
  const normalized = normalizeSteamInput(input);
  return normalized ? normalized.value : input.trim();
}

export function isSteamId64(input: string): boolean {
  return /^\d{17}$/.test(input);
}

export type SteamInput =
  | { kind: 'id64'; value: string }
  | { kind: 'vanity'; value: string };

export const STEAM_NOT_FOUND_MESSAGE =
  "Couldn't find that Steam profile. Paste your profile link or 17-digit Steam ID.";

// Steam custom URLs are letters, digits, "_" and "-".
const VANITY_RE = /^[A-Za-z0-9_-]{2,32}$/;

/**
 * Normalize whatever was pasted into the Steam field. Accepts a 17-digit
 * SteamID64, a steamcommunity.com/profiles/<id64> link, a
 * steamcommunity.com/id/<vanity> link (with or without scheme/www, trailing
 * slash, extra path, query or hash) and a bare vanity name. Returns null for
 * anything else so callers never send raw input to the Steam API.
 */
export function normalizeSteamInput(input: string): SteamInput | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;

  if (isSteamId64(trimmed)) return { kind: 'id64', value: trimmed };

  const url = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(profiles|id)\/([^\/?#\s]+)/i
  );
  if (url) {
    const segment = decodeURIComponentSafe(url[2]);
    if (url[1].toLowerCase() === 'profiles') {
      return isSteamId64(segment) ? { kind: 'id64', value: segment } : null;
    }
    return VANITY_RE.test(segment) ? { kind: 'vanity', value: segment } : null;
  }

  // Anything else that looks like a URL/path is not a vanity name.
  if (/[\/:.?#\s]/.test(trimmed)) return null;
  return VANITY_RE.test(trimmed) ? { kind: 'vanity', value: trimmed } : null;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
