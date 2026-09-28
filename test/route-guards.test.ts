import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as profile } from '../app/api/profile/route';

const get = (path: string, ip = '5.5.5.5') => new NextRequest(`http://localhost${path}`, { headers: { 'x-real-ip': ip } });

const realFetch = global.fetch;
let f: ReturnType<typeof vi.fn>;
beforeEach(() => { f = vi.fn(); global.fetch = f as unknown as typeof fetch; });
afterEach(() => { global.fetch = realFetch; });

describe('/api/profile guards', () => {
  it('rejects more than 6 accounts and over-long input before any lookup', async () => {
    const seven = Array.from({ length: 7 }, (_, i) => `xbox=Gamer${i}`).join('&');
    expect((await profile(get(`/api/profile?${seven}`))).status).toBe(400);
    expect((await profile(get(`/api/profile?steam=${'a'.repeat(201)}`))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('rate limits per IP (120/hour)', async () => {
    for (let i = 0; i < 120; i++) await profile(get(`/api/profile?steam=${'a'.repeat(201)}`, '6.6.6.6'));
    expect((await profile(get(`/api/profile?steam=${'a'.repeat(201)}`, '6.6.6.6'))).status).toBe(429);
  });
});
