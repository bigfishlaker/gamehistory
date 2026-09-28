import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryStore, UpstashStore, upstashConfigFromEnv } from '../lib/store';

describe('MemoryStore', () => {
  afterEach(() => vi.useRealTimers());

  it('expires values after their TTL', async () => {
    vi.useFakeTimers();
    const s = new MemoryStore();
    await s.set('a', { x: 1 }, 10);
    expect(await s.get('a')).toEqual({ x: 1 });
    vi.advanceTimersByTime(10_001);
    expect(await s.get('a')).toBeNull();
  });

  it('round-trips through JSON like Redis (Dates become strings)', async () => {
    const s = new MemoryStore();
    await s.set('d', { at: new Date('2026-01-01T00:00:00Z') }, 60);
    expect(await s.get('d')).toEqual({ at: '2026-01-01T00:00:00.000Z' });
  });

  it('incr counts within a window and resets after expiry', async () => {
    vi.useFakeTimers();
    const s = new MemoryStore();
    expect((await s.incr('c', 60)).count).toBe(1);
    expect((await s.incr('c', 60)).count).toBe(2);
    vi.advanceTimersByTime(60_001);
    expect((await s.incr('c', 60)).count).toBe(1);
  });
});

describe('upstashConfigFromEnv', () => {
  it('returns null without credentials (in-memory fallback)', () => {
    expect(upstashConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });
  it('accepts UPSTASH_REDIS_REST_* and the Vercel Marketplace KV_REST_API_* names', () => {
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://u', UPSTASH_REDIS_REST_TOKEN: 't' } as unknown as NodeJS.ProcessEnv)).toEqual({ url: 'https://u', token: 't' });
    expect(upstashConfigFromEnv({ KV_REST_API_URL: 'https://k', KV_REST_API_TOKEN: 't2' } as unknown as NodeJS.ProcessEnv)).toEqual({ url: 'https://k', token: 't2' });
  });
});

describe('UpstashStore', () => {
  it('sets an expiry on the first incr only', async () => {
    const redis = { incrby: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2), expire: vi.fn().mockResolvedValue(1), ttl: vi.fn().mockResolvedValue(42) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new UpstashStore(redis as any);
    expect((await s.incr('k', 60)).count).toBe(1);
    expect((await s.incr('k', 60)).count).toBe(2);
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith('k', 60);
  });
});
