import { isXboxIdentifier } from './validators';
/**
 * Input normalization for gaming platform identifiers.
 * Handles URLs, various formats, and extracts the core identifier.
 */

export interface NormalizationResult {
  success: boolean;
  identifier?: string;
  needsResolution?: boolean; // For Steam vanity URLs that need API resolution
  error?: string;
}

/**
 * Normalize Steam input.
 * Accepts:
 * - 17-digit SteamID64: 76561197960287930
 * - Profile URL: steamcommunity.com/profiles/76561197960287930
 * - Vanity URL: steamcommunity.com/id/gabelogannewell
 * - Bare vanity name: gabelogannewell
 */
export function normalizeSteamInput(input: string): NormalizationResult {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'Steam ID or profile URL is required' };
  }

  const trimmed = input.trim();

  // Check for 17-digit SteamID64
  if (/^\d{17}$/.test(trimmed)) {
    return { success: true, identifier: trimmed };
  }

  // Try to extract from URL
  try {
    // Remove protocol and www if present
    let cleaned = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    
    // Remove trailing slash and query params
    cleaned = cleaned.split('?')[0].replace(/\/+$/, '');

    // Check for profiles URL: steamcommunity.com/profiles/76561197960287930
    const profileMatch = cleaned.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    if (profileMatch) {
      return { success: true, identifier: profileMatch[1] };
    }

    // Check for vanity URL: steamcommunity.com/id/username
    const vanityMatch = cleaned.match(/steamcommunity\.com\/id\/([a-zA-Z0-9_-]+)/i);
    if (vanityMatch) {
      const vanityName = vanityMatch[1];
      // Validate vanity name format (3-32 characters)
      if (vanityName.length >= 3 && vanityName.length <= 32) {
        return {
          success: true,
          identifier: vanityName,
          needsResolution: true,
        };
      }
      return { success: false, error: 'Invalid Steam vanity name format (must be 3-32 characters)' };
    }

    // If it looks like a domain but doesn't match Steam patterns
    if (cleaned.includes('.') || cleaned.includes('/')) {
      return { success: false, error: 'Invalid Steam profile URL. Use steamcommunity.com/profiles/ID or steamcommunity.com/id/username' };
    }

    // Treat as bare vanity name (3-32 alphanumeric, dash, underscore)
    // But reject if it's all digits and not 17 characters (likely typo)
    if (/^\d+$/.test(trimmed) && trimmed.length !== 17) {
      return { success: false, error: 'Invalid SteamID64 (must be exactly 17 digits)' };
    }

    if (/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) {
      return {
        success: true,
        identifier: trimmed,
        needsResolution: true,
      };
    }

    return { success: false, error: 'Invalid Steam ID format. Enter a 17-digit SteamID64, profile URL, or username' };
  } catch (err) {
    return { success: false, error: 'Failed to parse Steam input' };
  }
}

/**
 * Normalize Xbox input.
 * Accepts:
 * - Raw gamertag: MajorNelson
 * - Xbox.com URL: xbox.com/en-us/profile/gamertag/MajorNelson
 * - XboxGamertag.com URL: xboxgamertag.com/search/MajorNelson
 */
export function normalizeXboxInput(input: string): NormalizationResult {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'Xbox gamertag is required' };
  }

  const trimmed = input.trim();

  // Try to extract from URL
  try {
    // Remove protocol and www
    let cleaned = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    
    // Remove trailing slash and query params
    cleaned = cleaned.split('?')[0].replace(/\/+$/, '');

    // Check for xbox.com URLs: xbox.com/*/profile/gamertag/Username
    const xboxProfileMatch = cleaned.match(/xbox\.com\/[^/]+\/profile\/gamertag\/([^/]+)/i);
    if (xboxProfileMatch) {
      const gamertag = decodeURIComponent(xboxProfileMatch[1]);
      return { success: true, identifier: gamertag };
    }

    // Check for simpler xbox.com pattern: xbox.com/profile/Username
    const xboxSimpleMatch = cleaned.match(/xbox\.com\/profile\/([^/]+)/i);
    if (xboxSimpleMatch) {
      const gamertag = decodeURIComponent(xboxSimpleMatch[1]);
      return { success: true, identifier: gamertag };
    }

    // Check for xboxgamertag.com: xboxgamertag.com/search/Username
    const xboxGamertagMatch = cleaned.match(/xboxgamertag\.com\/search\/([^/]+)/i);
    if (xboxGamertagMatch) {
      const gamertag = decodeURIComponent(xboxGamertagMatch[1]);
      return { success: true, identifier: gamertag };
    }

    // If it looks like a domain but doesn't match patterns
    if (cleaned.includes('.') || cleaned.includes('/')) {
      return { success: false, error: 'Invalid Xbox profile URL' };
    }

    // Raw gamertag (1-15 letters/digits/spaces), gamertag#suffix, or 16-digit XUID
    if (isXboxIdentifier(trimmed)) {
      return { success: true, identifier: trimmed };
    }

    return { success: false, error: 'Invalid Xbox gamertag format (1-15 letters, digits and spaces, optionally with a #suffix, or a 16-digit XUID)' };
  } catch (err) {
    return { success: false, error: 'Failed to parse Xbox input' };
  }
}

/**
 * Normalize PSN input.
 * Accepts:
 * - Raw PSN ID: PlayStation
 * - PSNProfiles URL: psnprofiles.com/PlayStation
 * - PSN URL: my.playstation.com/profile/PlayStation
 */
export function normalizePSNInput(input: string): NormalizationResult {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'PSN ID is required' };
  }

  const trimmed = input.trim();

  // Try to extract from URL
  try {
    // Remove protocol and www
    let cleaned = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    
    // Remove trailing slash and query params
    cleaned = cleaned.split('?')[0].replace(/\/+$/, '');

    // Check for psnprofiles.com: psnprofiles.com/Username
    const psnProfilesMatch = cleaned.match(/psnprofiles\.com\/([^/]+)/i);
    if (psnProfilesMatch) {
      const psnId = decodeURIComponent(psnProfilesMatch[1]);
      return { success: true, identifier: psnId };
    }

    // Check for my.playstation.com: my.playstation.com/profile/Username
    const playstationMatch = cleaned.match(/my\.playstation\.com\/profile\/([^/]+)/i);
    if (playstationMatch) {
      const psnId = decodeURIComponent(playstationMatch[1]);
      return { success: true, identifier: psnId };
    }

    // If it looks like a domain but doesn't match patterns
    if (cleaned.includes('.') || cleaned.includes('/')) {
      return { success: false, error: 'Invalid PSN profile URL' };
    }

    // Treat as raw PSN ID - validate format (3-16 alphanumeric, dash, underscore)
    if (/^[a-zA-Z0-9_-]{3,16}$/.test(trimmed)) {
      return { success: true, identifier: trimmed };
    }

    return { success: false, error: 'Invalid PSN ID format (3-16 alphanumeric characters, dash, or underscore)' };
  } catch (err) {
    return { success: false, error: 'Failed to parse PSN input' };
  }
}

/**
 * Resolve Steam vanity URL to SteamID64 using Steam Web API.
 */
export async function resolveSteamVanityUrl(
  vanityName: string,
  apiKey: string
): Promise<NormalizationResult> {
  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityName)}`
    );

    if (!response.ok) {
      return {
        success: false,
        error: 'Failed to resolve Steam username. Please try using your SteamID64 instead.',
      };
    }

    const data = await response.json();

    if (data.response?.success === 1 && data.response.steamid) {
      return {
        success: true,
        identifier: data.response.steamid,
      };
    }

    // Success code 42 means the vanity URL doesn't exist
    if (data.response?.success === 42) {
      return {
        success: false,
        error: `Steam user '${vanityName}' not found. Check the username or use your 17-digit SteamID64.`,
      };
    }

    return {
      success: false,
      error: 'Unable to resolve Steam username. Please use your 17-digit SteamID64.',
    };
  } catch (err) {
    return {
      success: false,
      error: 'Network error while resolving Steam username. Please try again.',
    };
  }
}
