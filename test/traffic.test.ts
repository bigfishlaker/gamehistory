import { describe, it, expect } from 'vitest';
import { shouldCount, normalizeTrafficPath, referrerHost, visitorHash, isBot, trafficDate, type TrafficRequest } from '../lib/traffic';
import { shouldSkipAnalytics } from '../lib/owner';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const req = (over: Partial<TrafficRequest> = {}, headers: Record<string, string> = {}): TrafficRequest => ({
  method: 'GET',
  pathname: '/',
  ownerCookie: false,
  ip: '203.0.113.9',
  host: 'gamer-id.vercel.app',
  headers: new Headers({ 'user-agent': UA, 'sec-fetch-dest': 'document', accept: 'text/html', ...headers }),
  ...over,
});

describe('traffic counter filters', () => {
  const env = { TRAFFIC_EXCLUDE_IPS: '198.51.100.7, 198.51.100.8' } as unknown as NodeJS.ProcessEnv;
  it('counts a normal page load', () => {
    expect(shouldCount(req(), env)).toBe(true);
  });
  it('skips the owner (cookie or excluded IP)', () => {
    expect(shouldCount(req({ ownerCookie: true }), env)).toBe(false);
    expect(shouldCount(req({ ip: '198.51.100.8' }), env)).toBe(false);
  });
  it('skips bots, API, assets, prefetches and non-GET', () => {
    expect(shouldCount(req({}, { 'user-agent': 'Twitterbot/1.0' }), env)).toBe(false);
    expect(shouldCount(req({}, { 'user-agent': 'Mozilla/5.0 HeadlessChrome/140' }), env)).toBe(false);
    expect(shouldCount(req({ pathname: '/api/profile' }), env)).toBe(false);
    expect(shouldCount(req({ pathname: '/icon.png' }), env)).toBe(false);
    expect(shouldCount(req({ pathname: '/owner' }), env)).toBe(false);
    expect(shouldCount(req({}, { rsc: '1' }), env)).toBe(false);
    expect(shouldCount(req({}, { 'next-router-prefetch': '1' }), env)).toBe(false);
    expect(shouldCount(req({}, { 'sec-fetch-dest': 'image' }), env)).toBe(false);
    expect(shouldCount(req({ method: 'POST' }), env)).toBe(false);
    expect(isBot(null)).toBe(true);
  });
  it('normalizes paths and referrers', () => {
    expect(normalizeTrafficPath('/u/AbC12345')).toBe('/u/:code');
    expect(referrerHost('https://t.co/xyz', 'gamer-id.vercel.app')).toBe('t.co');
    expect(referrerHost('https://gamer-id.vercel.app/p', 'gamer-id.vercel.app')).toBeNull();
    expect(referrerHost('not a url', 'gamer-id.vercel.app')).toBeNull();
  });
  it('hashes visitors without the raw IP and rotates daily', async () => {
    const a = await visitorHash('203.0.113.9', UA, '2026-09-27', 'salt');
    const b = await visitorHash('203.0.113.9', UA, '2026-09-28', 'salt');
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toContain('203');
    expect(a).not.toBe(b);
    expect(trafficDate(new Date('2026-09-28T02:00:00Z'))).toBe('2026-09-27'); // ET
  });
  it('skips client analytics for the owner and localhost', () => {
    expect(shouldSkipAnalytics('gamer-id.vercel.app', false)).toBe(false);
    expect(shouldSkipAnalytics('gamer-id.vercel.app', true)).toBe(true);
    expect(shouldSkipAnalytics('localhost', false)).toBe(true);
  });
});
