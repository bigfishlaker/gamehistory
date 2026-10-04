import { NextResponse, type NextRequest } from 'next/server';
import { createWalletClient, getAddress, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getStore } from '@/lib/store';
import { loadProfileData } from '@/lib/profile/load-profile';
import { publicMintConfig, type MintConfig } from './chains';
import { serverPublicClient } from './client';
import { quoteCardPrice } from './price';
import { readNftSecrets } from './server-env';
import { readSessionToken, SESSION_COOKIE } from './session';
import { bearerSession, isGrottoGameOrigin, verifyGrottoSession } from './grotto';
import { MintError, type MintDeps } from './mint-service';
import { devFixturesEnabled, fixtureProfile } from './dev-fixture';

export const NOT_CONFIGURED = { error: 'GAMER.ID Cards are not open yet' };

export function mintDeps(): MintDeps | null {
  const config: MintConfig | null = publicMintConfig();
  const secrets = readNftSecrets();
  if (!config || !secrets) return null;
  return {
    store: getStore(),
    client: serverPublicClient(config),
    config,
    secrets,
    loadProfile: devFixturesEnabled() ? async i => fixtureProfile(i) : loadProfileData,
    quote: chainId => quoteCardPrice(chainId),
    ...(secrets.relayerKey && config.payToken
      ? {
          relayer: createWalletClient({
            account: privateKeyToAccount(secrets.relayerKey),
            chain: config.chain,
            transport: http(config.rpcUrl, { fetchOptions: { headers: { 'user-agent': 'gamer-id/1.0' } }, timeout: 15_000, retryCount: 0 }),
          }),
        }
      : {}),
  };
}

/** CORS for uploaded Grotto builds (g-<hex>.games.enterthegrotto.xyz). Same-origin callers need none. */
export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin');
  const devLocal = devFixturesEnabled() && !!origin && /^http:\/\/localhost:\d+$/.test(origin);
  if (!isGrottoGameOrigin(origin) && !devLocal) return {};
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function preflight(req: NextRequest) {
  const h = corsHeaders(req);
  return new NextResponse(null, { status: Object.keys(h).length ? 204 : 403, headers: h });
}

export function json(req: NextRequest, body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { 'Cache-Control': 'no-store', ...corsHeaders(req), ...init?.headers } });
}

export function errorResponse(req: NextRequest, err: unknown, tag: string) {
  if (err instanceof MintError) return json(req, { error: err.message, code: err.code }, { status: err.status });
  console.error(`[nft:${tag}]`, err instanceof Error ? err.message : err);
  return json(req, { error: 'Something went wrong, please try again' }, { status: 500 });
}

export interface Caller {
  address: Address;
  via: 'siwe' | 'grotto';
  displayName?: string;
}

/**
 * Who is minting: a Grotto runtime session (Authorization: Bearer grs_..., verified with Grotto)
 * or the SIWE session cookie. The card always goes to this address.
 */
export async function resolveCaller(req: NextRequest, sessionSecret: string): Promise<Caller | null> {
  const grs = bearerSession(req.headers.get('authorization'));
  // Local development only (NFT_DEV_FIXTURES=1, never in production): `grs_devlocal_<40 hex>`
  // stands in for a Grotto session so the embedded flow can be tested without The Grotto.
  const dev = grs && devFixturesEnabled() ? grs.match(/^grs_devlocal_([0-9a-fA-F]{40})$/) : null;
  if (dev) return { address: getAddress(`0x${dev[1]}`), via: 'grotto', displayName: 'Local tester' };
  if (grs) {
    const player = await verifyGrottoSession(grs, { expectedGameId: process.env.GROTTO_GAME_ID?.trim() || undefined }).catch(() => null);
    return player ? { address: player.wallet, via: 'grotto', displayName: player.displayName } : null;
  }
  const address = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret);
  return address ? { address, via: 'siwe' } : null;
}

export function siteOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  return configured || new URL(req.url).origin;
}
