import type { NextRequest } from 'next/server';
import { formatUnits } from 'viem';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getStore } from '@/lib/store';
import { publicMintConfig } from '@/lib/nft/chains';
import { nftKeys, type VoucherRecord } from '@/lib/nft/mint-service';
import { parseTop6Json } from '@/lib/nft/top6';
import { json, NOT_CONFIGURED, preflight } from '@/lib/nft/route-helpers';

/**
 * GET /api/nft/voucher/:id -> the signed voucher, for the "pay with any wallet" page.
 * A voucher can only mint to its `to` address at its price, so it is safe to show.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const cfg = publicMintConfig();
  if (!cfg) return json(req, NOT_CONFIGURED, { status: 503 });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return json(req, { error: 'Not found' }, { status: 404 });
  const rec = await getStore().get<VoucherRecord>(nftKeys.voucher(id));
  if (!rec || rec.chainId !== cfg.chain.id) return json(req, { error: 'This mint link has expired' }, { status: 404 });
  return json(req, {
    id: rec.id,
    chainId: rec.chainId,
    contract: rec.contract,
    voucher: rec.voucher,
    top6Json: rec.top6Json,
    top6: parseTop6Json(rec.top6Json)?.top6 ?? [],
    signature: rec.signature,
    price: formatUnits(BigInt(rec.voucher.price), cfg.chain.nativeCurrency.decimals),
    symbol: cfg.chain.nativeCurrency.symbol,
    snapshot: rec.snapshot,
    expiresAt: Number(rec.voucher.deadline) * 1000,
  });
}

export const OPTIONS = preflight;
