import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress, isAddress, type Address } from 'viem';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { PublicClient } from 'viem';
import { getStore } from '@/lib/store';

/**
 * Sign-In with Ethereum (EIP-4361) for /mint. Flow:
 *   GET  /api/nft/siwe            -> { nonce }          (nonce stored 10 min, single use)
 *   POST /api/nft/siwe {message, signature} -> sets an HttpOnly session cookie (HMAC-signed, 24h)
 * The wallet signature is the only identity check (game accounts are not verified).
 */
export const SESSION_COOKIE = 'gid_nft_session';
export const SESSION_TTL_SECONDS = 24 * 3600;
const NONCE_TTL_SECONDS = 10 * 60;

export const siweNonceKey = (nonce: string) => `nft:siwe:nonce:${nonce}`;
export const siweUsedKey = (nonce: string) => `nft:siwe:used:${nonce}`;

export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  await getStore().set(siweNonceKey(nonce), 1, NONCE_TTL_SECONDS);
  return nonce;
}

export interface VerifySiweInput {
  message: string;
  signature: `0x${string}`;
  /** Expected host (e.g. gamer-id.vercel.app), from the request URL. */
  domain: string;
  allowedChainIds: number[];
  client: PublicClient;
  now?: Date;
}

export type VerifySiweResult = { ok: true; address: Address; chainId: number } | { ok: false; error: string };

export async function verifySiwe(input: VerifySiweInput): Promise<VerifySiweResult> {
  if (input.message.length > 2000) return { ok: false, error: 'Message too long' };
  const fields = parseSiweMessage(input.message);
  if (!fields.address || !fields.nonce || !fields.chainId) return { ok: false, error: 'Malformed sign-in message' };
  if (!input.allowedChainIds.includes(fields.chainId)) return { ok: false, error: 'Wrong network' };
  if (!fields.issuedAt || !fields.expirationTime) return { ok: false, error: 'Sign-in message must have an issue and expiry time' };
  const valid = validateSiweMessage({ message: fields, domain: input.domain, time: input.now ?? new Date() });
  if (!valid) return { ok: false, error: 'Sign-in message is expired or for another site' };
  const store = getStore();
  if (!(await store.get(siweNonceKey(fields.nonce)))) return { ok: false, error: 'Unknown or expired nonce' };
  // Single use: the first verifier to bump the counter wins.
  const { count } = await store.incr(siweUsedKey(fields.nonce), NONCE_TTL_SECONDS);
  if (count !== 1) return { ok: false, error: 'Nonce already used' };
  await store.del(siweNonceKey(fields.nonce));
  // verifyMessage on the public client also supports smart-contract wallets (ERC-1271 / ERC-6492).
  const ok = await input.client.verifyMessage({ address: fields.address, message: input.message, signature: input.signature });
  if (!ok) return { ok: false, error: 'Bad signature' };
  return { ok: true, address: getAddress(fields.address), chainId: fields.chainId };
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(address: Address, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ a: address, e: Math.floor(now / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token: string | undefined, secret: string, now = Date.now()): Address | null {
  if (!token || token.length > 512) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, secret));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { a: string; e: number };
    if (typeof e !== 'number' || e * 1000 < now || !isAddress(a)) return null;
    return getAddress(a);
  } catch {
    return null;
  }
}
