import type { NextRequest } from 'next/server';
import { publicMintConfig } from '@/lib/nft/chains';
import { json, preflight } from '@/lib/nft/route-helpers';
import { readNftSecrets } from '@/lib/nft/server-env';

/** GET /api/nft/config -> which chain/contract the mint uses (public values only). */
export async function GET(req: NextRequest) {
  const cfg = publicMintConfig();
  const ready = !!cfg && !!readNftSecrets();
  return json(req, cfg
    ? { open: ready, chainId: cfg.chain.id, chainName: cfg.chain.name, contract: cfg.contract, symbol: cfg.chain.nativeCurrency.symbol, explorer: cfg.chain.blockExplorers?.default.url ?? null }
    : { open: false });
}

export const OPTIONS = preflight;
