import { getAddress, isAddress, type Address } from 'viem';

/**
 * Grotto game-runtime sessions. When the card game runs inside The Grotto, the runtime gives
 * the game a `grs_...` session id. Our server verifies it with Grotto (never trusting a wallet
 * address sent by the client) and mints to the player's Grotto wallet.
 * The API base is fixed here; a runtime-provided apiBaseUrl is never used server-side.
 */
export const GROTTO_RUNTIME_API = 'https://api.enterthegrotto.xyz/api/game-runtime/v1';
const SESSION_RE = /^grs_[A-Za-z0-9_-]{8,256}$/;

/** Origins allowed to call the card API cross-origin (uploaded Grotto builds). */
export function isGrottoGameOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && /^g-[0-9a-f]{32}\.games\.enterthegrotto\.xyz$/.test(u.hostname) && !u.port;
  } catch {
    return false;
  }
}

export interface GrottoPlayer {
  wallet: Address;
  displayName?: string;
  gameId?: string;
}

function pickWallet(body: Record<string, unknown>): string | undefined {
  const player = (body.player ?? body.user ?? body) as Record<string, unknown>;
  for (const v of [player.walletAddress, player.wallet, player.address, body.walletAddress, body.playerId]) {
    if (typeof v === 'string' && isAddress(v)) return v;
  }
  return undefined;
}

export function bearerSession(header: string | null): string | null {
  const m = header?.match(/^Bearer (grs_[A-Za-z0-9_-]+)$/);
  return m && SESSION_RE.test(m[1]) ? m[1] : null;
}

export async function verifyGrottoSession(
  sessionId: string,
  opts: { expectedGameId?: string; fetchImpl?: typeof fetch } = {},
): Promise<GrottoPlayer | null> {
  if (!SESSION_RE.test(sessionId)) return null;
  const res = await (opts.fetchImpl ?? fetch)(`${GROTTO_RUNTIME_API}/session/me`, {
    headers: { accept: 'application/json', authorization: `Bearer ${sessionId}`, 'user-agent': 'gamer-id/1.0' },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return null;
  const wallet = pickWallet(body);
  if (!wallet) return null;
  const session = (body.session ?? body) as Record<string, unknown>;
  const gameId = typeof session.gameId === 'string' ? session.gameId : typeof body.gameId === 'string' ? body.gameId : undefined;
  if (opts.expectedGameId && gameId && gameId !== opts.expectedGameId) return null;
  const player = (body.player ?? body) as Record<string, unknown>;
  return {
    wallet: getAddress(wallet),
    displayName: typeof player.displayName === 'string' ? player.displayName.slice(0, 64) : undefined,
    gameId,
  };
}
