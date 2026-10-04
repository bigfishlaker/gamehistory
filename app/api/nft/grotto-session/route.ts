import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { gamerIdCardAbi } from '@/lib/nft/abi';
import { json, mintDeps, NOT_CONFIGURED, preflight, resolveCaller } from '@/lib/nft/route-helpers';

/**
 * POST /api/nft/grotto-session  (Authorization: Bearer grs_...)
 * -> { wallet, displayName, tokenId|null }  The wallet comes from Grotto's own session check.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const deps = mintDeps();
  if (!deps) return json(req, NOT_CONFIGURED, { status: 503 });
  if (!req.headers.get('authorization')) return json(req, { error: 'Missing Grotto session' }, { status: 401 });
  const caller = await resolveCaller(req, deps.secrets.sessionSecret);
  if (!caller || caller.via !== 'grotto') return json(req, { error: 'Grotto session is not valid' }, { status: 401 });
  const tokenId = (await deps.client.readContract({
    address: deps.config.contract, abi: gamerIdCardAbi, functionName: 'tokenOf', args: [caller.address],
  }).catch(() => BigInt(0))) as bigint;
  return json(req, { wallet: caller.address, displayName: caller.displayName ?? null, tokenId: tokenId ? tokenId.toString() : null });
}

export const OPTIONS = preflight;
