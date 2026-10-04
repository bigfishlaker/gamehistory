import { NextResponse, type NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getCard } from '@/lib/nft/mint-service';
import { cardMetadata, liveStats, toCardView } from '@/lib/nft/card-view';
import { mintDeps, siteOrigin } from '@/lib/nft/route-helpers';

/** GET /api/nft/:id -> ERC-721 metadata (tokenURI = <base>/api/nft/<id>). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'nftMeta');
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const deps = mintDeps();
  if (!deps) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const card = await getCard(deps, BigInt(id)).catch(() => null);
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  const { stats, live } = await liveStats(deps.store, card, deps.loadProfile);
  return NextResponse.json(cardMetadata(toCardView(card, stats, live), siteOrigin(req)), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
