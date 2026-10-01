import type { Platform } from './types';

/**
 * Turns the raw per-account error map from /api/profile (keys like "steam-7656...",
 * "xbox-Name-playtime", "psn-id-games") into friendly, actionable messages.
 * Presentation only: the API's error data is not changed.
 */
export type AccountErrorKind = 'private' | 'not-found' | 'busy' | 'unavailable' | 'partial' | 'other';

export interface FriendlyAccountError {
  key: string;
  platform: Platform | null;
  account: string;
  kind: AccountErrorKind;
  title: string;
  detail: string;
  steps?: string[];
}

const PLATFORM_NAMES: Record<Platform, string> = { xbox: 'Xbox', steam: 'Steam', psn: 'PlayStation', epic: 'Fortnite' };

export const STEAM_PRIVACY_STEPS = [
  'Open Steam and go to your profile',
  'Click Edit Profile, then Privacy Settings',
  'Set "Game details" to Public (and uncheck "Always keep my total playtime private")',
  'Wait a minute, then reload this page',
];

export const XBOX_PRIVACY_STEPS = [
  'On your Xbox, open Settings > Account > Privacy & online safety',
  'Choose Xbox privacy > View details & customize > Game & app content',
  'Set "Others can see your game and app history" to Everybody',
  'Wait a few minutes, then reload this page',
];

export function parseErrorKey(key: string): { platform: Platform | null; account: string; part: 'games' | 'playtime' | null } {
  const m = key.match(/^(xbox|steam|psn|epic)-(.*?)(?:-(games|playtime))?$/);
  if (!m) return { platform: null, account: key, part: null };
  return { platform: m[1] as Platform, account: m[2], part: (m[3] as 'games' | 'playtime' | undefined) ?? null };
}

export function describeAccountError(key: string, message: string): FriendlyAccountError {
  const { platform, account, part } = parseErrorKey(key);
  const name = platform ? PLATFORM_NAMES[platform] : 'Account';
  const base = { key, platform, account };
  const msg = message || '';

  if (/busy|lookup limit|BUDGET/i.test(msg)) {
    return {
      ...base,
      kind: 'busy',
      title: `${platform ? name : 'Xbox'} is busy right now, showing your other platforms`,
      detail: part === 'playtime'
        ? `Hours for ${account} aren't counted yet. Try again in a few minutes.`
        : `${account} couldn't be looked up this hour. Try again in a few minutes.`,
    };
  }
  if (platform === 'steam' && /not public|private/i.test(msg)) {
    return {
      ...base,
      kind: 'private',
      title: 'This Steam profile is private',
      detail: `Steam doesn't share the games for ${account} until its game details are public.`,
      steps: STEAM_PRIVACY_STEPS,
    };
  }
  if (platform === 'xbox' && /game history is private/i.test(msg)) {
    return {
      ...base,
      kind: 'private',
      title: 'This Xbox game history is private',
      detail: `Xbox doesn't share the games for ${account} until their game history is visible to everybody.`,
      steps: XBOX_PRIVACY_STEPS,
    };
  }
  if (platform === 'epic' && /private/i.test(msg)) {
    return {
      ...base,
      kind: 'private',
      title: 'These Fortnite stats are private',
      detail: msg,
    };
  }
  if (/private/i.test(msg)) {
    return { ...base, kind: 'private', title: `This ${name} profile is private`, detail: `${account}: ${msg}` };
  }
  if (/not found|no player|could not find|couldn't find/i.test(msg)) {
    const what = platform === 'xbox' ? 'Gamertag' : platform === 'psn' ? 'PSN Online ID' : platform === 'epic' ? 'Epic account' : 'Steam profile';
    return {
      ...base,
      kind: 'not-found',
      title: `${what} not found`,
      detail: platform === 'epic' ? `${msg} Check the spelling and try again.` : `We couldn't find "${account}". Check the spelling and try again.`,
    };
  }
  if (platform === 'psn') {
    return {
      ...base,
      kind: 'unavailable',
      title: 'PlayStation is unavailable right now',
      detail: `${account} couldn't be loaded from PlayStation Network. Your other platforms are still shown. Try again later.`,
    };
  }
  if (part === 'playtime') {
    return { ...base, kind: 'partial', title: `Hours unavailable for ${account}`, detail: `Games are shown, but ${name} didn't return playtime, so it isn't counted.` };
  }
  return { ...base, kind: 'other', title: `${name} account couldn't be loaded`, detail: `${account}: ${msg || 'Please try again shortly.'}` };
}

export function describeAccountErrors(errors: Record<string, string> | undefined | null): FriendlyAccountError[] {
  return Object.entries(errors ?? {}).map(([k, v]) => describeAccountError(k, String(v)));
}
