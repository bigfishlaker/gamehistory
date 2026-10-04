import { parseUnits } from 'viem';

/**
 * Price quote for the $5 card, paid in the chain's native token.
 *
 * - The Grotto: HERESY/USD from GeckoTerminal (HERESY on Avalanche C-Chain, the liquid market;
 *   the on-Grotto HERESY/USDC pool is too thin to use). Cached for 60s, bounded by sanity limits,
 *   fails closed. The contract's owner-set minPriceWei floor protects against a bad quote.
 * - Fuji (testnet) and the local fork: fixed test price (NFT_TEST_PRICE_WEI, default 0.01).
 * - NFT_NATIVE_USD_PRICE overrides the USD price on any chain (manual fallback).
 */
export const CARD_PRICE_USD = 5;
export const QUOTE_TTL_SECONDS = 15 * 60;
const HERESY_C_CHAIN = '0x432d38f83a50ec77c409d086e97448794cf76dcf';
const GECKO_URL = `https://api.geckoterminal.com/api/v2/simple/networks/avax/token_price/${HERESY_C_CHAIN}`;
const MIN_SANE_USD = 0.01;
const MAX_SANE_USD = 1_000_000;

export interface PriceQuote {
  chainId: number;
  priceWei: bigint;
  usd: number;
  nativeUsd: number | null;
  source: 'geckoterminal' | 'env' | 'test-fixed';
  quotedAt: number;
}

let cached: { usd: number; at: number } | null = null;

export async function fetchHeresyUsd(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<number> {
  if (cached && now - cached.at < 60_000) return cached.usd;
  const res = await fetchImpl(GECKO_URL, { headers: { accept: 'application/json', 'user-agent': 'gamer-id/1.0' }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`price source HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { attributes?: { token_prices?: Record<string, string> } } };
  const usd = Number(body.data?.attributes?.token_prices?.[HERESY_C_CHAIN]);
  if (!Number.isFinite(usd) || usd < MIN_SANE_USD || usd > MAX_SANE_USD) throw new Error('price out of range');
  cached = { usd, at: now };
  return usd;
}

export function resetPriceCacheForTests() {
  cached = null;
}

/** wei = usd / nativeUsd, rounded UP to 1e-6 native so the quote never undershoots $5. */
export function usdToWei(usd: number, nativeUsd: number): bigint {
  if (!(nativeUsd > 0)) throw new Error('bad native price');
  const micro = Math.ceil((usd / nativeUsd) * 1e6);
  return parseUnits(String(micro), 12);
}

export async function quoteCardPrice(
  chainId: number,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<PriceQuote> {
  const override = Number(env.NFT_NATIVE_USD_PRICE);
  if (chainId !== 36463) {
    const raw = env.NFT_TEST_PRICE_WEI?.trim();
    const priceWei = raw && /^\d+$/.test(raw) ? BigInt(raw) : BigInt(10) ** BigInt(16);
    return { chainId, priceWei, usd: CARD_PRICE_USD, nativeUsd: null, source: 'test-fixed', quotedAt: now };
  }
  if (Number.isFinite(override) && override > 0) {
    return { chainId, priceWei: usdToWei(CARD_PRICE_USD, override), usd: CARD_PRICE_USD, nativeUsd: override, source: 'env', quotedAt: now };
  }
  const nativeUsd = await fetchHeresyUsd(fetchImpl, now);
  return { chainId, priceWei: usdToWei(CARD_PRICE_USD, nativeUsd), usd: CARD_PRICE_USD, nativeUsd, source: 'geckoterminal', quotedAt: now };
}
