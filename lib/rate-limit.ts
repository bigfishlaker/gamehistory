import { NextResponse, type NextRequest } from 'next/server';
import { getStore } from './store';

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
} satisfies Record<string, RateLimitRule>;

export type RouteBucket = keyof typeof ROUTE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimit(
  req: Pick<NextRequest, 'headers'>,
  bucket: RouteBucket,
  rule: RateLimitRule = ROUTE_LIMITS[bucket]
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds);
  const key = `rl:${bucket}:${getClientIp(req)}:${window}`;
  try {
    const { count, ttlSeconds } = await getStore().incr(key, rule.windowSeconds);
    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: ttlSeconds,
    };
  } catch (err) {
    // A store outage must not take the site down; fail open but log it.
    console.warn('[rate-limit] store error, allowing request:', err instanceof Error ? err.message : err);
    return { allowed: true, limit: rule.limit, remaining: rule.limit, retryAfterSeconds: 0 };
  }
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
    console.warn('[budget] store error, allowing request:', err instanceof Error ? err.message : err);
    return { allowed: true, used: 0, remaining: 0 };
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
