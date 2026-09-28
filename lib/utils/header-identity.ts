import type { PlayerProfile } from '../types';

/**
 * Name and avatar for the pooled header / export card: the first ENABLED account
 * (so toggling the first account off no longer leaves its name on the card), with a
 * user-chosen picture taking precedence.
 */
export function pickHeaderIdentity(
  profiles: Array<Pick<PlayerProfile, 'platform' | 'id' | 'displayName' | 'avatarUrl'>>,
  disabledAccounts: Set<string>,
  customAvatarUrl?: string | null
): { displayName: string; avatarUrl?: string; platform?: PlayerProfile['platform'] } {
  const first = profiles.find(p => !disabledAccounts.has(`${p.platform}:${p.id}`)) ?? profiles[0];
  return {
    displayName: first?.displayName || 'Player',
    avatarUrl: customAvatarUrl || first?.avatarUrl,
    platform: first?.platform,
  };
}
