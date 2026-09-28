export const MAX_ACCOUNTS_PER_POOL = 6;
export const MAX_INPUT_LENGTH = 100;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateGamertag(gamertag: string): ValidationResult {
  if (!gamertag || typeof gamertag !== 'string') {
    return { valid: false, error: 'Gamertag is required' };
  }

  const trimmed = gamertag.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Gamertag cannot be empty' };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Gamertag too long (max ${MAX_INPUT_LENGTH} characters)` };
  }

  // Xbox gamertags: 1-15 characters, alphanumeric and spaces
  if (!/^[a-zA-Z0-9\s]{1,15}$/.test(trimmed)) {
    return { valid: false, error: 'Invalid gamertag format (1-15 alphanumeric characters and spaces)' };
  }

  return { valid: true };
}

export function validateSteamId(steamId: string): ValidationResult {
  if (!steamId || typeof steamId !== 'string') {
    return { valid: false, error: 'Steam ID is required' };
  }

  const trimmed = steamId.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Steam ID cannot be empty' };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Steam ID too long (max ${MAX_INPUT_LENGTH} characters)` };
  }

  // Steam ID64 is 17 digits, or custom URL (alphanumeric, dash, underscore)
  if (!/^(\d{17}|[a-zA-Z0-9_-]{3,32})$/.test(trimmed)) {
    return { valid: false, error: 'Invalid Steam ID format (17-digit SteamID64 or 3-32 character custom URL)' };
  }

  return { valid: true };
}

export function validatePSNId(psnId: string): ValidationResult {
  if (!psnId || typeof psnId !== 'string') {
    return { valid: false, error: 'PSN ID is required' };
  }

  const trimmed = psnId.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'PSN ID cannot be empty' };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `PSN ID too long (max ${MAX_INPUT_LENGTH} characters)` };
  }

  // PSN IDs: 3-16 characters, alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9_-]{3,16}$/.test(trimmed)) {
    return { valid: false, error: 'Invalid PSN ID format (3-16 alphanumeric characters, dash, or underscore)' };
  }

  return { valid: true };
}

export function validateAccountPoolSize(
  xboxCount: number,
  steamCount: number,
  psnCount: number
): ValidationResult {
  const total = xboxCount + steamCount + psnCount;

  if (total === 0) {
    return { valid: false, error: 'At least one account is required' };
  }

  if (total > MAX_ACCOUNTS_PER_POOL) {
    return {
      valid: false,
      error: `Maximum ${MAX_ACCOUNTS_PER_POOL} accounts allowed per pool (you provided ${total})`,
    };
  }

  return { valid: true };
}

/* ---- Achievements / image proxy inputs ---- */

export const MAX_IMAGE_URL_LENGTH = 2048;

/** /api/achievements query: platform + account id + title id. */
export function validateAchievementsQuery(platform: string | null, playerId: string | null, gameId: string | null): ValidationResult {
  if (!platform || !playerId || !gameId) return { valid: false, error: 'platform, playerId, and gameId are required' };
  if (platform === 'xbox') {
    if (!/^\d{16}$/.test(playerId)) return { valid: false, error: 'Invalid Xbox player id' };
    if (!/^\d{1,12}$/.test(gameId)) return { valid: false, error: 'Invalid Xbox title id' };
  } else if (platform === 'steam') {
    if (!/^\d{17}$/.test(playerId)) return { valid: false, error: 'Invalid Steam id' };
    if (!/^\d{1,10}$/.test(gameId)) return { valid: false, error: 'Invalid Steam app id' };
  } else {
    return { valid: false, error: 'Unsupported platform' };
  }
  return { valid: true };
}
