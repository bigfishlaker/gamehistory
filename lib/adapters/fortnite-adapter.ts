import type { ApiResult } from '../types';
import { reserveUpstream } from '../rate-limit';
import {
  parseFortniteStats,
  FORTNITE_PRIVATE_MESSAGE,
  FORTNITE_BUSY_MESSAGE,
  fortniteNotFoundMessage,
  fortniteNoMatchesMessage,
  type FortniteStats,
} from '../fortnite';

const BASE_URL = 'https://fortnite-api.com/v2/stats/br/v2';
const TIMEOUT_MS = 10_000;

/**
 * fortnite-api.com Battle Royale stats for an Epic display name. The API key is sent
 * in the Authorization header from the server only; it never reaches the browser.
 *
 * Observed responses (2026-09-27): 200 stats; 403 {"error":"the requested account's
 * stats are not public"}; 404 {"error":"the requested account does not exist"};
 * 404 {"error":"the requested profile didnt play any match yet"}; 429 {"error":"the
 * maximum allowed requests are 3 per 1s..."}.
 */
export class FortniteAdapter {
  constructor(private readonly apiKey: string) {}

  async getStats(name: string): Promise<ApiResult<FortniteStats>> {
    const budget = await reserveUpstream('fortnite');
    if (!budget.allowed) {
      return { success: false, error: { error: 'Busy', code: 'BUDGET_EXHAUSTED', message: FORTNITE_BUSY_MESSAGE } };
    }
    const url = `${BASE_URL}?${new URLSearchParams({ name, accountType: 'epic', timeWindow: 'lifetime' })}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { Authorization: this.apiKey, Accept: 'application/json' }, signal: controller.signal });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const upstreamError = typeof body?.error === 'string' ? body.error : '';
      if (res.ok) {
        const stats = parseFortniteStats(body);
        if (stats) return { success: true, data: stats };
        console.warn('[fortnite] unexpected response shape');
        return { success: false, error: { error: 'Bad response', message: "Couldn't read Fortnite stats right now. Please try again shortly." } };
      }
      if (res.status === 403) {
        return { success: false, error: { error: 'Private profile', code: 'PRIVATE_PROFILE', message: FORTNITE_PRIVATE_MESSAGE } };
      }
      if (res.status === 404) {
        const noMatches = /didn.?t play|any match/i.test(upstreamError);
        return {
          success: false,
          error: { error: 'Not found', code: 'PLAYER_NOT_FOUND', message: noMatches ? fortniteNoMatchesMessage(name) : fortniteNotFoundMessage(name) },
        };
      }
      if (res.status === 429 || res.status === 503) {
        console.warn(`[fortnite] upstream HTTP ${res.status}: ${upstreamError.slice(0, 200)}`);
        return { success: false, error: { error: 'Busy', code: 'BUDGET_EXHAUSTED', message: FORTNITE_BUSY_MESSAGE } };
      }
      // 400/401/5xx: log server-side only (never the key), give users a plain sentence.
      console.warn(`[fortnite] upstream HTTP ${res.status}: ${upstreamError.slice(0, 200)}`);
      return {
        success: false,
        error: { error: 'API error', code: `HTTP_${res.status}`, message: 'Fortnite stats are unavailable right now. Please try again shortly.' },
      };
    } catch (err) {
      console.warn('[fortnite] request failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: { error: 'Network error', message: "Couldn't reach the Fortnite stats service. Please try again shortly." } };
    } finally {
      clearTimeout(timer);
    }
  }
}
