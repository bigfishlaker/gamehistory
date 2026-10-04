import { createHmac } from 'node:crypto';
import type { Hex } from 'viem';
import type { Platform } from '@/lib/types';

/** A game account, identified by the platform's stable id (XUID, SteamID64, PSN account id, Epic account id). */
export interface AccountRef {
  platform: Platform;
  id: string;
}

export function canonicalAccountId(a: AccountRef): string {
  return `${a.platform}:${a.id.trim().toLowerCase()}`;
}

/**
 * bytes32 key stored on-chain for "one card per game account". HMAC-SHA256 with a server
 * secret, so the public key cannot be reversed to a gamertag by brute force.
 */
export function accountKey(a: AccountRef, secret: string): Hex {
  return `0x${createHmac('sha256', secret).update(`gamerid:card:v1:${canonicalAccountId(a)}`).digest('hex')}`;
}

export function uniqueAccounts(list: AccountRef[]): AccountRef[] {
  const seen = new Set<string>();
  return list.filter(a => {
    const k = canonicalAccountId(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
