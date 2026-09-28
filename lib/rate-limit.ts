import { NextResponse, type NextRequest } from 'next/server';
import { getStore, MemoryStore } from './store';
import { FORTNITE_BUSY_MESSAGE } from './fortnite';

/* ------------------------------------------------------------------ *
 * Client IP
 * ------------------------------------------------------------------ */

/**
 * On Vercel, `x-real-ip` and the first `x-forwarded-for` entry are set by the
 * platform edge from the TCP peer (client-supplied values are overwritten), so
 * they are safe to key on there. Locally everything is "local".
 */
export function getClientIp(req: Pick<NextRequest, 'headers'>): string {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd) return fwd.slice(0, 64);
  return 'local';
}

/* ------------------------------------------------------------------ *
 * Per-IP fixed-window rate limits (shared across instances via the store)
 * ------------------------------------------------------------------ */

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/** Limits per route family. Numbers are per client IP. */
export const ROUTE_LIMITS = {
  profile: { limit: 120, windowSeconds: 3600 },
  achievements: { limit: 120, windowSeconds: 3600 },
  image: { limit: 600, windowSeconds: 600 },
  share: { limit: 20, windowSeconds: 3600 },
  /** Extra per-IP limit for /api/profile requests that include Epic/Fortnite accounts. */
  fortnite: { limit: 60, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

export type RouteBucket = keyof typeof ROUTE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Per-process fallback used only when the shared store errors. Limits then apply
 * per serverless instance instead of globally, which is looser than normal but
 * never "unlimited" (the old behaviour was to let every request through).
 */
const fallbackLimiter = ((globalThis as unknown as { __ghFallbackLimiter?: MemoryStore }).__ghFallbackLimiter ??= new MemoryStore());

export async function rateLimit(
  req: Pick<NextRequest, 'headers'>,
  bucket: RouteBucket,
  rule: RateLimitRule = ROUTE_LIMITS[bucket]
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds);
  const key = `rl:${bucket}:${getClientIp(req)}:${window}`;
  let counted: { count: number; ttlSeconds: number };
  try {
    counted = await getStore().incr(key, rule.windowSeconds);
  } catch (err) {
    console.warn('[rate-limit] store error, using per-process fallback limiter:', err instanceof Error ? err.message : err);
    counted = await fallbackLimiter.incr(key, rule.windowSeconds);
  }
  return {
    allowed: counted.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - counted.count),
    retryAfterSeconds: counted.ttlSeconds,
  };
}

/** Tests only: clear the per-process fallback limiter. */
export function resetFallbackLimiterForTests(): void {
  fallbackLimiter.clear();
}

export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please wait a bit and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds || 60),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

/** Convenience: returns a 429 response when limited, otherwise null. */
export async function enforceRateLimit(req: Pick<NextRequest, 'headers'>, bucket: RouteBucket): Promise<NextResponse | null> {
  const r = await rateLimit(req, bucket);
  return r.allowed ? null : tooManyRequests(r);
}

/* ------------------------------------------------------------------ *
 * Global OpenXBL budget (free tier: 150 requests/hour, keep 20 in reserve)
 * ------------------------------------------------------------------ */

export const OPENXBL_HOURLY_LIMIT = 150;
export const OPENXBL_RESERVE = 20;
export const BUSY_MESSAGE =
  'GAMER.ID is busy right now: the hourly Xbox lookup limit is almost used up. Please try again in a few minutes.';

const UPSTREAM_REMAINING_KEY = 'budget:openxbl:upstream-remaining';
const hourKey = () => `budget:openxbl:${Math.floor(Date.now() / 3_600_000)}`;

export interface BudgetStatus {
  allowed: boolean;
  used: number;
  /** Requests left before the reserve, by our own count. */
  remaining: number;
  /** Last X-RateLimit-Remaining reported by OpenXBL, if known. */
  upstreamRemaining?: number;
}

/**
 * Reserve one OpenXBL request. Denied when our own hourly count would eat into
 * the reserve, or when OpenXBL itself last reported <= reserve requests left
 * (the key is shared with anything else using it, so upstream is the truth).
 */
export async function reserveOpenXblRequest(): Promise<BudgetStatus> {
  const store = getStore();
  try {
    const upstream = await store.get<number>(UPSTREAM_REMAINING_KEY);
    if (typeof upstream === 'number' && upstream <= OPENXBL_RESERVE) {
      return { allowed: false, used: OPENXBL_HOURLY_LIMIT - upstream, remaining: 0, upstreamRemaining: upstream };
    }
    const secondsLeftInHour = 3600 - (Math.floor(Date.now() / 1000) % 3600);
    const { count } = await store.incr(hourKey(), secondsLeftInHour + 60);
    const cap = OPENXBL_HOURLY_LIMIT - OPENXBL_RESERVE;
    if (count > cap) {
      return { allowed: false, used: count - 1, remaining: 0, upstreamRemaining: upstream ?? undefined };
    }
    return { allowed: true, used: count, remaining: cap - count, upstreamRemaining: upstream ?? undefined };
  } catch (err) {
    // Fail closed: without the shared counter we can't tell how much of the hourly
    // OpenXBL quota is left, and draining it would break Xbox for everyone.
    console.warn('[budget] store error, refusing OpenXBL request (fail closed):', err instanceof Error ? err.message : err);
    return { allowed: false, used: 0, remaining: 0 };
  }
}

/** Remember OpenXBL's own X-RateLimit-Remaining (expires with its window). */
export async function recordOpenXblRemaining(remaining: number | undefined, resetSeconds?: number): Promise<void> {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return;
  const ttl = resetSeconds && resetSeconds > 0 && resetSeconds <= 3600 ? resetSeconds : 3600;
  try {
    await getStore().set(UPSTREAM_REMAINING_KEY, remaining, ttl);
  } catch {
    /* non-fatal */
  }
}

export async function getOpenXblBudget(): Promise<BudgetStatus> {
  const store = getStore();
  const used = (await store.get<number>(hourKey())) ?? 0;
  const upstream = await store.get<number>(UPSTREAM_REMAINING_KEY);
  const cap = OPENXBL_HOURLY_LIMIT - OPENXBL_RESERVE;
  const upstreamOk = typeof upstream !== 'number' || upstream > OPENXBL_RESERVE;
  return { allowed: used < cap && upstreamOk, used, remaining: Math.max(0, cap - used), upstreamRemaining: upstream ?? undefined };
}

/* ------------------------------------------------------------------ *
 * Global hourly budgets for Steam and PSN upstream calls
 * ------------------------------------------------------------------ */

/**
 * Steam Web API allows ~100,000 calls/day (~4,100/hour); a profile load costs 2-3
 * calls, so 1,500/hour (~500 uncached lookups) leaves plenty of headroom.
 * PSN runs on the owner's own account, so keep it modest: a lookup costs ~5
 * units (see PSN_COST in the adapter), so 600/hour is ~120 uncached lookups.
 * Fortnite (fortnite-api.com): 600 lookups/hour, one call per uncached lookup, fails closed.
 * Cached profile/achievement hits never reach the adapters, so they cost nothing.
 */
export const UPSTREAM_HOURLY_LIMITS = { steam: 1500, psn: 600, fortnite: 600 } as const;
/** Upstreams that refuse (instead of using a per-process budget) when the store errors. */
const UPSTREAM_FAIL_CLOSED: Partial<Record<keyof typeof UPSTREAM_HOURLY_LIMITS, true>> = { fortnite: true };
export type UpstreamName = keyof typeof UPSTREAM_HOURLY_LIMITS;

export const STEAM_BUSY_MESSAGE =
  'GAMER.ID is busy right now: the hourly Steam lookup limit is used up. Please try again in a few minutes.';
export const PSN_BUSY_MESSAGE =
  'GAMER.ID is busy right now: the hourly PlayStation lookup limit is used up. Please try again in a few minutes.';
export const UPSTREAM_BUSY_MESSAGES: Record<UpstreamName, string> = { steam: STEAM_BUSY_MESSAGE, psn: PSN_BUSY_MESSAGE, fortnite: FORTNITE_BUSY_MESSAGE };

const fallbackBudgets = ((globalThis as unknown as { __ghFallbackBudgets?: MemoryStore }).__ghFallbackBudgets ??= new MemoryStore());

/**
 * Reserve `cost` units of an upstream's hourly budget. Shared across instances via
 * the store; if the store errors, a per-process counter with the same cap is used
 * (so Steam/PSN keep working during a store outage, but never unbounded).
 */
export async function reserveUpstream(name: UpstreamName, cost = 1): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = UPSTREAM_HOURLY_LIMITS[name];
  const key = `budget:${name}:${Math.floor(Date.now() / 3_600_000)}`;
  const ttl = 3600 - (Math.floor(Date.now() / 1000) % 3600) + 60;
  let count: number;
  try {
    ({ count } = await getStore().incr(key, ttl, cost));
  } catch (err) {
    if (UPSTREAM_FAIL_CLOSED[name]) {
      console.warn(`[budget] store error, refusing ${name} request (fail closed):`, err instanceof Error ? err.message : err);
      return { allowed: false, used: 0, limit };
    }
    console.warn(`[budget] store error, using per-process ${name} budget:`, err instanceof Error ? err.message : err);
    ({ count } = await fallbackBudgets.incr(key, ttl, cost));
  }
  if (count > limit) {
    console.warn(`[budget] ${name} hourly budget exhausted (${count - cost}/${limit})`);
    return { allowed: false, used: count - cost, limit };
  }
  return { allowed: true, used: count, limit };
}

/** Tests only. */
export function resetFallbackBudgetsForTests(): void {
  fallbackBudgets.clear();
}

export function busyResponse(): NextResponse {
  return NextResponse.json({ error: BUSY_MESSAGE, busy: true }, { status: 503, headers: { 'Retry-After': '300' } });
}

/* ------------------------------------------------------------------ *
 * Deduplicate concurrent identical lookups (per instance; the shared cache
 * covers repeats across instances once the first lookup finishes)
 * ------------------------------------------------------------------ */

const pending = ((globalThis as unknown as { __ghPending?: Map<string, Promise<unknown>> }).__ghPending ??= new Map());

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
