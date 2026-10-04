import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { publicMintConfig } from '@/lib/nft/chains';
import { serverPublicClient } from '@/lib/nft/client';
import { readNftSecrets } from '@/lib/nft/server-env';
import { createSessionToken, issueNonce, readSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, verifySiwe } from '@/lib/nft/session';
import { json, NOT_CONFIGURED } from '@/lib/nft/route-helpers';

/** GET /api/nft/siwe -> { nonce, address|null }  (address = current session, if any) */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const secrets = readNftSecrets();
  if (!secrets) return json(req, NOT_CONFIGURED, { status: 503 });
  const address = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value, secrets.sessionSecret);
  return json(req, { nonce: await issueNonce(), address });
}

/** POST /api/nft/siwe { message, signature } -> sets the session cookie. */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'nft');
  if (limited) return limited;
  const secrets = readNftSecrets();
  const cfg = publicMintConfig();
  if (!secrets || !cfg) return json(req, NOT_CONFIGURED, { status: 503 });
  const body = (await req.json().catch(() => null)) as { message?: unknown; signature?: unknown } | null;
  if (typeof body?.message !== 'string' || typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(body.signature)) {
    return json(req, { error: 'message and signature are required' }, { status: 400 });
  }
  const url = new URL(req.url);
  const result = await verifySiwe({
    message: body.message,
    signature: body.signature as `0x${string}`,
    domain: url.host,
    allowedChainIds: [cfg.chain.id],
    client: serverPublicClient(cfg),
  }).catch(() => ({ ok: false as const, error: 'Could not verify the signature' }));
  if (!result.ok) return json(req, { error: result.error }, { status: 401 });
  const res = json(req, { address: result.address });
  res.cookies.set(SESSION_COOKIE, createSessionToken(result.address, secrets.sessionSecret), {
    httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

/** DELETE /api/nft/siwe -> sign out. */
export async function DELETE(req: NextRequest) {
  const res = json(req, { ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
