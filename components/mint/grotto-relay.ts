/**
 * The Grotto host transaction relay (not in the public runtime SDK; reverse-read from the
 * enterthegrotto.xyz game page, Oct 2026). A game frame posts
 *   { type: 'bobert:tx', requestId, version: 1, chainId: 36463, tx: { to, data, value: '0x0' } }
 * to the Grotto page, which, only if this exact build (by sha256) has a Grotto-approved
 * `transaction_relay` policy listing `to` + the 4-byte selector, asks the player's Privy embedded
 * wallet to send it (value is forced to 0, gas is fixed at 100,000) and answers with
 *   { requestId, type: 'grotto:tx-status', status: 'received' | 'approving' | 'sent' }
 *   { requestId, type: 'grotto:tx-result', ok: true, txHash } | { ..., ok: false, code, error }.
 * The game can read the active policy itself: GET {apiBaseUrl}/transaction-relay-policy.
 */
import type { GrottoRuntimeConfig } from './grotto-runtime';

export const GROTTO_CHAIN_ID = 36463;
export const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

export interface RelayPolicy {
  version: 1;
  buildSha256: string;
  calls: { to: string; selectors: string[] }[];
}

export class RelayError extends Error {
  constructor(message: string, readonly code: 'rejected' | 'insufficient_funds' | 'unsupported' | 'error' | 'timeout') {
    super(message);
  }
}

function parsePolicy(p: unknown): RelayPolicy | null {
  const x = p as Partial<RelayPolicy> | null;
  if (!x || typeof x !== 'object' || x.version !== 1 || typeof x.buildSha256 !== 'string' || !Array.isArray(x.calls)) return null;
  const calls = x.calls.filter(c => c && typeof c.to === 'string' && Array.isArray(c.selectors))
    .map(c => ({ to: c.to.toLowerCase(), selectors: c.selectors.filter(s => typeof s === 'string').map(s => s.toLowerCase()) }));
  return { version: 1, buildSha256: x.buildSha256, calls };
}

/** The relay policy Grotto granted this build, or null (no policy, or not running in The Grotto). */
export async function fetchRelayPolicy(rt: GrottoRuntimeConfig): Promise<RelayPolicy | null> {
  try {
    const res = await fetch(`${rt.apiBaseUrl}/transaction-relay-policy`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${rt.sessionId}` },
      cache: 'no-store', credentials: 'omit',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { transactionRelay?: unknown };
    return parsePolicy(body.transactionRelay);
  } catch {
    return null;
  }
}

export function policyAllows(policy: RelayPolicy | null, to: string, selector: string): boolean {
  return !!policy?.calls.some(c => c.to === to.toLowerCase() && c.selectors.includes(selector.toLowerCase()));
}

function hostWindow(): Window | null {
  try {
    return window.top && window.top !== window ? window.top : window.parent !== window ? window.parent : null;
  } catch {
    return window.parent !== window ? window.parent : null;
  }
}

/** Asks The Grotto to send `tx` from the player's embedded wallet. Resolves with the tx hash. */
export function requestGrottoTx(
  tx: { to: `0x${string}`; data: `0x${string}` },
  opts: { chainId?: number; onStatus?: (s: 'received' | 'approving' | 'sent') => void; timeoutMs?: number } = {},
): Promise<`0x${string}`> {
  const host = hostWindow();
  if (!host) return Promise.reject(new RelayError('Not running inside The Grotto', 'unsupported'));
  const requestId = `gid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(() => reject(new RelayError('The Grotto did not answer', 'timeout'))), opts.timeoutMs ?? 180_000);
    function finish(f: () => void) {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      f();
    }
    function onMessage(e: MessageEvent) {
      if (e.source !== host && e.source !== window.parent) return;
      const d = e.data as { requestId?: string; type?: string; status?: string; ok?: boolean; txHash?: string; code?: string; error?: string } | null;
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'grotto:tx-status' && (d.status === 'received' || d.status === 'approving' || d.status === 'sent')) opts.onStatus?.(d.status);
      if (d.type !== 'grotto:tx-result') return;
      if (d.ok && typeof d.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(d.txHash)) finish(() => resolve(d.txHash as `0x${string}`));
      else {
        const code = (['rejected', 'insufficient_funds', 'unsupported'] as const).find(c => c === d.code) ?? 'error';
        finish(() => reject(new RelayError(d.error || 'The Grotto wallet could not send the transaction', code)));
      }
    }
    window.addEventListener('message', onMessage);
    host.postMessage({ type: 'bobert:tx', requestId, version: 1, chainId: opts.chainId ?? GROTTO_CHAIN_ID, tx: { to: tx.to, data: tx.data, value: '0x0' } }, '*');
  });
}
