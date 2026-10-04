import { ImageResponse } from 'next/og';
import { NextResponse, type NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getCard } from '@/lib/nft/mint-service';
import { liveStats, toCardView } from '@/lib/nft/card-view';
import { CardArt, CARD_HEIGHT, CARD_WIDTH, inlineCover } from '@/lib/nft/card-art';
import { mintDeps } from '@/lib/nft/route-helpers';

/** GET /api/nft/:id/image -> PNG card (total hours, Top 6 covers, tier frame, serial). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'nftMeta');
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const deps = mintDeps();
  if (!deps) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const card = await getCard(deps, BigInt(id)).catch(() => null);
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { stats, live } = await liveStats(deps.store, card, deps.loadProfile);
  const view = toCardView(card, stats, live);
  const covers = await Promise.all(view.top6.map(g => inlineCover(g.c)));
  return new ImageResponse(<CardArt view={view} covers={covers} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400', 'Access-Control-Allow-Origin': '*' },
  });
}
