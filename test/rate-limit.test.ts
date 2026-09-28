import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getClientIp, rateLimit, enforceRateLimit, ROUTE_LIMITS,
  reserveOpenXblRequest, recordOpenXblRemaining, getOpenXblBudget,
  OPENXBL_HOURLY_LIMIT, OPENXBL_RESERVE, BUSY_MESSAGE, busyResponse, dedupe,
} from '../lib/rate-limit';
import { XboxAdapter } from '../lib/adapters/xbox-adapter';

const reqWith = (h: Record<string, string>) => new NextRequest('http://localhost/api/x', { headers: h });

describe('getClientIp', () => {
  it('prefers x-real-ip, then the first x-forwarded-for hop, else "local"', () => {
    expect(getClientIp(reqWith({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(getClientIp(reqWith({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3');
    expect(getClientIp(reqWith({}))).toBe('local');
  });
});

describe('per-IP rate limit', () => {
  it('returns 429 with Retry-After after the limit, per IP', async () => {
    const a = reqWith({ 'x-real-ip': '9.9.9.9' });
    for (let i = 0; i < ROUTE_LIMITS.profile.limit; i++) expect(await enforceRateLimit(a, 'profile')).toBeNull();
    const blocked = await enforceRateLimit(a, 'profile');
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0);
    // another IP is unaffected
    expect((await rateLimit(reqWith({ 'x-real-ip': '8.8.8.8' }), 'profile')).allowed).toBe(true);
  });
});

describe('global OpenXBL budget (150/hr, 20 reserve)', () => {
  it('allows 130 requests per hour, then refuses', async () => {
    const cap = OPENXBL_HOURLY_LIMIT - OPENXBL_RESERVE;
    expect(cap).toBe(130);
    for (let i = 0; i < cap; i++) expect((await reserveOpenXblRequest()).allowed).toBe(true);
    expect((await reserveOpenXblRequest()).allowed).toBe(false);
    expect((await getOpenXblBudget()).allowed).toBe(false);
  });

  it('refuses when OpenXBL itself reports <= 20 remaining', async () => {
    await recordOpenXblRemaining(20);
    expect((await reserveOpenXblRequest()).allowed).toBe(false);
    await recordOpenXblRemaining(21);
    expect((await reserveOpenXblRequest()).allowed).toBe(true);
  });

  it('busy response is a friendly 503', async () => {
    const r = busyResponse();
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body).toEqual({ error: BUSY_MESSAGE, busy: true });
    expect(body.error).not.toMatch(/[{}]/);
  });
});

describe('XboxAdapter respects the budget', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns BUDGET_EXHAUSTED without calling OpenXBL', async () => {
    await recordOpenXblRemaining(5);
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    const r = await new XboxAdapter('k').getGameLibrary('2533274800000009');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.code).toBe('BUDGET_EXHAUSTED');
      expect(r.error.message).toBe(BUSY_MESSAGE);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('records X-RateLimit-Remaining from OpenXBL responses', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: { xuid: '2533274800000009', titles: [] } }), {
      status: 200, headers: { 'content-type': 'application/json', 'X-RateLimit-Remaining': '15', 'X-RateLimit-Limit': '150' },
    })) as unknown as typeof fetch;
    await new XboxAdapter('k').getGameLibrary('2533274800000009');
    const b = await getOpenXblBudget();
    expect(b.upstreamRemaining).toBe(15);
    expect(b.allowed).toBe(false);
  });
});

describe('dedupe', () => {
  it('shares one in-flight promise between concurrent identical lookups', async () => {
    let calls = 0;
    const fn = () => new Promise<number>((res) => { calls++; setTimeout(() => res(42), 5); });
    const [a, b, c] = await Promise.all([dedupe('k', fn), dedupe('k', fn), dedupe('k', fn)]);
    expect([a, b, c]).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
    await dedupe('k', fn); // finished -> a new call runs
    expect(calls).toBe(2);
  });
});
