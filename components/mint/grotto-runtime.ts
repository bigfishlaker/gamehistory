/**
 * Minimal browser client for The Grotto game runtime (same protocol as
 * https://api.enterthegrotto.xyz/sdk/grotto-game-runtime.v1.js, no external script needed):
 * the game posts `grotto:runtime:hello` to its parent; the parent answers with
 * `{ type: 'grotto:runtime', runtime: { apiBaseUrl, gameId, sessionId: 'grs_...', playerId?, scopes } }`.
 * The session id is kept in memory only (never in URLs, logs or storage).
 */
export interface GrottoRuntimeConfig {
  apiBaseUrl: string;
  gameId: string;
  sessionId: string;
  playerId?: string;
  scopes: string[];
}

let pending: Promise<GrottoRuntimeConfig> | null = null;

export function isEmbedded(): boolean {
  try {
    return typeof window !== 'undefined' && window.parent !== window;
  } catch {
    return true;
  }
}

function validate(r: unknown): GrottoRuntimeConfig {
  const x = r as Partial<GrottoRuntimeConfig> | null;
  if (!x || typeof x !== 'object') throw new Error('Missing Grotto runtime config');
  if (typeof x.apiBaseUrl !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*enterthegrotto\.xyz(\/|$)/.test(x.apiBaseUrl)) throw new Error('Invalid runtime apiBaseUrl');
  if (typeof x.gameId !== 'string' || !x.gameId) throw new Error('Invalid runtime gameId');
  if (typeof x.sessionId !== 'string' || !x.sessionId.startsWith('grs_')) throw new Error('Invalid runtime sessionId');
  return { apiBaseUrl: x.apiBaseUrl.replace(/\/+$/, ''), gameId: x.gameId, sessionId: x.sessionId, playerId: typeof x.playerId === 'string' ? x.playerId : undefined, scopes: Array.isArray(x.scopes) ? x.scopes : [] };
}

export function waitForGrottoRuntime(timeoutMs = 10_000): Promise<GrottoRuntimeConfig> {
  if (pending) return pending;
  pending = new Promise<GrottoRuntimeConfig>((resolve, reject) => {
    if (!isEmbedded()) {
      reject(new Error('Not running inside The Grotto'));
      return;
    }
    const hello = () => {
      try {
        window.parent.postMessage({ type: 'grotto:runtime:hello' }, '*');
      } catch {
        /* ignore */
      }
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for The Grotto'));
    }, timeoutMs);
    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent) return;
      const d = e.data as { type?: string; runtime?: unknown } | null;
      if (!d || d.type !== 'grotto:runtime') return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      try {
        resolve(validate(d.runtime));
      } catch (err) {
        reject(err);
      }
    }
    window.addEventListener('message', onMessage);
    hello();
    window.setTimeout(hello, 250);
    window.setTimeout(hello, 1000);
  });
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** Leaderboard score via the runtime API (best per player is kept by Grotto). Failures are ignored. */
export async function submitGrottoScore(rt: GrottoRuntimeConfig, score: number, board = 'hours', meta?: Record<string, unknown>) {
  try {
    await fetch(`${rt.apiBaseUrl}/events`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${rt.sessionId}` },
      body: JSON.stringify({ type: 'score', payload: { score, board, meta } }),
    });
  } catch {
    /* leaderboard is optional */
  }
}
