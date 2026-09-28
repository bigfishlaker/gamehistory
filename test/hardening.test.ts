import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  rateLimit, enforceRateLimit, ROUTE_LIMITS, reserveOpenXblRequest, reserveUpstream,
  UPSTREAM_HOURLY_LIMITS, STEAM_BUSY_MESSAGE, resetFallbackLimiterForTests, resetFallbackBudgetsForTests,
} from '../lib/rate-limit';
import { MemoryStore, setStoreForTests, getStore, type KVStore } from '../lib/store';
import { SteamAdapter } from '../lib/adapters/steam-adapter';
import { POST as share } from '../app/api/share/route';
import { SHARE_TTL_SECONDS, SHARE_DAILY_CAP, shareDailyKey } from '../lib/share-links';
import { normalizeTrafficPath, recordPageView, MAX_REFERRERS_PER_DAY, REFERRER_INCR_SCRIPT, type TrafficRequest } from '../lib/traffic';
import { describeAccountError } from '../lib/account-errors';

/** A store whose every call fails, like Upstash during an outage or when out of memory. */
class BrokenStore implements KVStore {
  readonly kind = 'upstash' as const;
  private fail(): never { throw new Error('ECONNRESET'); }
  async get<T>(): Promise<T | null> { return this.fail(); }
  async set(): Promise<void> { this.fail(); }
  async setMany(): Promise<void> { this.fail(); }
  async del(): Promise<void> { this.fail(); }
  async incr(): Promise<{ count: number; ttlSeconds: number }> { return this.fail(); }
}

const reqWith = (ip: string) => new NextRequest('http://localhost/api/x', { headers: { 'x-real-ip': ip } });
const postShare = (body: unknown, ip = '7.7.7.7') =>
  new NextRequest('http://localhost/api/share', { method: 'POST', headers: { 'x-real-ip': ip, 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  resetFallbackLimiterForTests();
  resetFallbackBudgetsForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('1. store outage: fail closed / per-process fallback', () => {
  it('per-IP limits fall back to an in-memory limiter (still 429s) instead of allowing everything', async () => {
    setStoreForTests(new BrokenStore());
    const a = reqWith('9.9.9.1');
    for (let i = 0; i < ROUTE_LIMITS.share.limit; i++) expect(await enforceRateLimit(a, 'share')).toBeNull();
    expect((await enforceRateLimit(a, 'share'))?.status).toBe(429);
    expect((await rateLimit(reqWith('9.9.9.2'), 'share')).allowed).toBe(true);
  });

  it('the OpenXBL budget refuses requests when the store errors', async () => {
    setStoreForTests(new BrokenStore());
    expect((await reserveOpenXblRequest()).allowed).toBe(false);
  });

  it('share creation returns 503 and writes nothing when the store errors', async () => {
    setStoreForTests(new BrokenStore());
    const res = await share(postShare({ xbox: ['Stallion83'] }));
    expect(res.status).toBe(503);
  });

  it('keeps a single IP (e.g. the owner) at 120 profile lookups/hour (limits unchanged)', async () => {
    expect(ROUTE_LIMITS.profile).toEqual({ limit: 120, windowSeconds: 3600 });
    const owner = reqWith('203.0.113.50');
    for (let i = 0; i < 120; i++) expect((await rateLimit(owner, 'profile')).allowed).toBe(true);
    expect((await rateLimit(owner, 'profile')).allowed).toBe(false);
  });
});

describe('2. share links: daily cap and 1-year TTL', () => {
  it('uses a 1-year TTL for new links', async () => {
    expect(SHARE_TTL_SECONDS).toBe(365 * 24 * 3600);
    const store = new MemoryStore();
    const setSpy = vi.spyOn(store, 'set');
    setStoreForTests(store);
    const res = await share(postShare({ xbox: ['Stallion83'] }));
    expect(res.status).toBe(201);
    expect(setSpy.mock.calls.every(([, , ttl]) => ttl === SHARE_TTL_SECONDS)).toBe(true);
  });

  it(`refuses new links after ${SHARE_DAILY_CAP}/day, but re-sharing an existing set still works`, async () => {
    const first = await share(postShare({ xbox: ['Stallion83'] }));
    const { code } = await first.json();
    await getStore().incr(shareDailyKey(), 3600, SHARE_DAILY_CAP);
    const blocked = await share(postShare({ xbox: ['Major Nelson'] }, '7.7.7.8'));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).not.toMatch(/[{}]/);
    const again = await share(postShare({ xbox: ['Stallion83'] }, '7.7.7.9'));
    expect(again.status).toBe(200);
    expect((await again.json()).code).toBe(code);
  });
});

describe('3. global hourly Steam/PSN budgets', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('caps Steam calls per hour and falls back to a per-process budget on store errors', async () => {
    const cap = UPSTREAM_HOURLY_LIMITS.steam;
    expect((await reserveUpstream('steam', cap)).allowed).toBe(true);
    expect((await reserveUpstream('steam')).allowed).toBe(false);
    setStoreForTests(new BrokenStore());
    expect((await reserveUpstream('psn', UPSTREAM_HOURLY_LIMITS.psn)).allowed).toBe(true);
    expect((await reserveUpstream('psn')).allowed).toBe(false);
  });

  it('SteamAdapter returns BUDGET_EXHAUSTED without calling Steam when the budget is used up', async () => {
    await reserveUpstream('steam', UPSTREAM_HOURLY_LIMITS.steam);
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    const lib = await new SteamAdapter('k').getGameLibrary('76561197960287930');
    const vanity = await new SteamAdapter('k').resolvePlayer('gabelogannewell');
    for (const r of [lib, vanity]) {
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.code).toBe('BUDGET_EXHAUSTED');
        expect(r.error.message).toBe(STEAM_BUSY_MESSAGE);
      }
    }
    expect(f).not.toHaveBeenCalled();
    expect(describeAccountError('steam-gabelogannewell', STEAM_BUSY_MESSAGE)).toMatchObject({ kind: 'busy', title: 'Steam is busy right now, showing your other platforms' });
  });

  it('keeps normal use well under the caps', () => {
    expect(UPSTREAM_HOURLY_LIMITS.steam).toBeGreaterThanOrEqual(1000);
    expect(UPSTREAM_HOURLY_LIMITS.psn).toBeGreaterThanOrEqual(300);
  });
});

describe('4. traffic counter key growth', () => {
  it('folds unknown paths into /other', () => {
    expect(normalizeTrafficPath('/')).toBe('/');
    expect(normalizeTrafficPath('/help/')).toBe('/help');
    expect(normalizeTrafficPath('/p')).toBe('/p');
    expect(normalizeTrafficPath('/u/AbC12345')).toBe('/u/:code');
    expect(normalizeTrafficPath('/wp-admin')).toBe('/other');
    expect(normalizeTrafficPath('/random-' + 'x'.repeat(200))).toBe('/other');
    expect(normalizeTrafficPath('/u/a/b')).toBe('/other');
  });

  it('records the referrer through the capped script (max 50 hosts/day, then "other")', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const pipe = new Proxy({}, {
      get: (_t, prop: string) => (...args: unknown[]) => { if (prop === 'exec') return Promise.resolve([]); calls.push([prop, args]); return pipe; },
    });
    const fakeRedis = { pipeline: () => pipe } as unknown as Parameters<typeof recordPageView>[1];
    const req: TrafficRequest = {
      method: 'GET', pathname: '/wp-login', ownerCookie: false, ip: '203.0.113.5', host: 'gamer-id.vercel.app',
      headers: new Headers({ 'user-agent': 'Mozilla/5.0 Chrome/140', 'sec-fetch-dest': 'document', referer: 'https://spam-' + Math.random() + '.example/' }),
    };
    expect(await recordPageView(req, fakeRedis)).toBe(true);
    expect(calls.find(([m]) => m === 'hincrby')?.[1][1]).toBe('/other');
    const ev = calls.find(([m]) => m === 'eval');
    expect(ev?.[1][0]).toBe(REFERRER_INCR_SCRIPT);
    expect(ev?.[1][2]).toEqual([expect.stringContaining('.example'), String(MAX_REFERRERS_PER_DAY), expect.any(String)]);
    expect(MAX_REFERRERS_PER_DAY).toBe(50);
    expect(calls.some(([m, a]) => m === 'hincrby' && String(a[0]).endsWith(':refs'))).toBe(false);
  });
});
