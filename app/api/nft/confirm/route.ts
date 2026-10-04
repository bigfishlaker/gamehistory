import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { confirmMintTx } from '@/lib/nft/mint-service';
import { errorResponse, json, mintDeps, NOT_CONFIGURED, preflight, siteOrigin } from '@/lib/nft/route-helpers';

/** POST /api/nft/confirm { txHash } -> records the minted card(s). Idempotent, no auth needed (reads the chain). */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const deps = mintDeps();
  if (!deps) return json(req, NOT_CONFIGURED, { status: 503 });
  const body = (await req.json().catch(() => null)) as { txHash?: unknown } | null;
  if (typeof body?.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return json(req, { error: 'txHash is required' }, { status: 400 });
  }
  try {
    const cards = await confirmMintTx(deps, body.txHash as `0x${string}`);
    const origin = siteOrigin(req);
    return json(req, {
      cards: cards.map(c => ({
        tokenId: c.tokenId,
        owner: c.owner,
        cardUrl: `${origin}/mint/card/${c.tokenId}`,
        image: `${origin}/api/nft/${c.tokenId}/image`,
        metadata: `${origin}/api/nft/${c.tokenId}`,
      })),
    });
  } catch (err) {
    return errorResponse(req, err, 'confirm');
  }
}

export const OPTIONS = preflight;
