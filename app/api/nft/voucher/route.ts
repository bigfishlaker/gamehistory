import type { NextRequest } from 'next/server';
import { formatUnits } from 'viem';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseAccountInputs } from '@/lib/nft/inputs';
import { prepareVoucher } from '@/lib/nft/mint-service';
import { errorResponse, json, mintDeps, NOT_CONFIGURED, preflight, resolveCaller, siteOrigin } from '@/lib/nft/route-helpers';

const MAX_BODY = 4096;

/**
 * POST /api/nft/voucher { accounts: { xbox?, steam?, psn?, epic? }, top6: string[], pay?: 'native' | 'token' }
 * Auth: SIWE session cookie, or `Authorization: Bearer grs_...` inside The Grotto.
 * -> { id, chainId, contract, voucher, top6Json, signature, price, symbol, payUrl }
 * The voucher mints to the signed-in wallet; anyone may pay it (e.g. via payUrl).
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const deps = mintDeps();
  if (!deps) return json(req, NOT_CONFIGURED, { status: 503 });

  const caller = await resolveCaller(req, deps.secrets.sessionSecret);
  if (!caller) return json(req, { error: 'Sign in with your wallet first' }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BODY) return json(req, { error: 'Request too large' }, { status: 413 });
  let body: { accounts?: unknown; top6?: unknown; pay?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json(req, { error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = parseAccountInputs(body.accounts);
  if (!parsed.ok) return json(req, { error: parsed.error }, { status: 400 });
  if (!Array.isArray(body.top6) || body.top6.some(t => typeof t !== 'string' || t.length > 200)) {
    return json(req, { error: 'top6 must be a list of game keys' }, { status: 400 });
  }
  if (body.pay !== undefined && body.pay !== 'native' && body.pay !== 'token') {
    return json(req, { error: "pay must be 'native' or 'token'" }, { status: 400 });
  }
  const pay = body.pay === 'token' ? 'token' : 'native';

  try {
    const rec = await prepareVoucher(deps, { to: caller.address, input: parsed.input, picks: body.top6 as string[], via: caller.via, pay });
    const c = deps.config.chain;
    const token = pay === 'token' ? deps.config.payToken : undefined;
    return json(req, {
      id: rec.id,
      chainId: rec.chainId,
      contract: rec.contract,
      voucher: rec.voucher,
      top6Json: rec.top6Json,
      signature: rec.signature,
      price: formatUnits(BigInt(rec.voucher.price), token ? token.decimals : c.nativeCurrency.decimals),
      symbol: token ? token.symbol : c.nativeCurrency.symbol,
      pay,
      snapshot: rec.snapshot,
      payUrl: `${siteOrigin(req)}/mint/pay/${rec.id}`,
    }, { status: 201 });
  } catch (err) {
    return errorResponse(req, err, 'voucher');
  }
}

export const OPTIONS = preflight;
