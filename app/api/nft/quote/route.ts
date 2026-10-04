import type { NextRequest } from 'next/server';
import { formatUnits } from 'viem';
import { enforceRateLimit } from '@/lib/rate-limit';
import { publicMintConfig } from '@/lib/nft/chains';
import { CARD_PRICE_USD, quoteCardPrice, QUOTE_TTL_SECONDS } from '@/lib/nft/price';
import { json, NOT_CONFIGURED, preflight } from '@/lib/nft/route-helpers';

/** GET /api/nft/quote -> indicative price (the binding price is the one signed into the voucher). */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const cfg = publicMintConfig();
  if (!cfg) return json(req, NOT_CONFIGURED, { status: 503 });
  try {
    const q = await quoteCardPrice(cfg.chain.id);
    return json(req, {
      chainId: cfg.chain.id,
      usd: CARD_PRICE_USD,
      priceWei: q.priceWei.toString(),
      price: formatUnits(q.priceWei, cfg.chain.nativeCurrency.decimals),
      symbol: cfg.chain.nativeCurrency.symbol,
      nativeUsd: q.nativeUsd,
      source: q.source,
      validForSeconds: QUOTE_TTL_SECONDS,
    });
  } catch {
    return json(req, { error: 'Price is unavailable right now' }, { status: 503 });
  }
}

export const OPTIONS = preflight;
