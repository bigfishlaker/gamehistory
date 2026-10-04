import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { relayMint } from '@/lib/nft/mint-service';
import { errorResponse, json, mintDeps, NOT_CONFIGURED, preflight, resolveCaller } from '@/lib/nft/route-helpers';

/**
 * POST /api/nft/relay-mint { voucherId } -> { txHash }
 * Auth: the voucher's own wallet (Grotto runtime session or SIWE). Call after the wallet approved
 * the pay token; 409 ALLOWANCE_PENDING means the approval is not on-chain yet (retry shortly).
 * Then POST /api/nft/confirm { txHash } (or poll grotto-session) to get the card.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const deps = mintDeps();
  if (!deps) return json(req, NOT_CONFIGURED, { status: 503 });
  const caller = await resolveCaller(req, deps.secrets.sessionSecret);
  if (!caller) return json(req, { error: 'Sign in first' }, { status: 401 });
  const text = await req.text();
  if (text.length > 512) return json(req, { error: 'Request too large' }, { status: 413 });
  let body: { voucherId?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json(req, { error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.voucherId !== 'string') return json(req, { error: 'voucherId is required' }, { status: 400 });
  try {
    return json(req, await relayMint(deps, { voucherId: body.voucherId, caller: caller.address }));
  } catch (err) {
    return errorResponse(req, err, 'relay-mint');
  }
}

export const OPTIONS = preflight;
