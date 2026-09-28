import { Redis } from '@upstash/redis';

/**
 * Small key/value store used for rate limits, the OpenXBL budget, the profile
 * cache and the Xbox friend-graph cache.
 *
 * - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are
 *   set (or KV_REST_API_URL + KV_REST_API_TOKEN, the names the Vercel Marketplace
 *   Upstash integration injects). Shared by every serverless instance.
 * - In-memory fallback for local dev and tests (per process; kept on globalThis so
 *   Next.js dev hot reloads don't wipe it and re-spend API quota).
 */
export interface KVStore {
  readonly kind: 'upstash' | 'memory';
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  setMany<T>(entries: Array<[string, T]>, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomically add `by` to a counter. The TTL is applied when the key is created. */
  incr(key: string, ttlSeconds: number, by?: number): Promise<{ count: number; ttlSeconds: number }>;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryStore implements KVStore {
  readonly kind = 'memory' as const;
  private map = new Map<string, MemoryEntry>();

  private live(key: string): MemoryEntry | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() >= e.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  async get<T>(key: string): Promise<T | null> {
    const e = this.live(key);
    // Round-trip through JSON so local behaviour matches Redis (Dates become strings).
    return e ? (JSON.parse(JSON.stringify(e.value)) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (this.map.size > 5000) this.sweep();
  }

  async setMany<T>(entries: Array<[string, T]>, ttlSeconds: number): Promise<void> {
    for (const [k, v] of entries) await this.set(k, v, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlSeconds: number, by = 1): Promise<{ count: number; ttlSeconds: number }> {
    const e = this.live(key);
    if (!e) {
      this.map.set(key, { value: by, expiresAt: Date.now() + ttlSeconds * 1000 });
      if (this.map.size > 5000) this.sweep();
      return { count: by, ttlSeconds };
    }
    e.value = Number(e.value) + by;
    return { count: e.value as number, ttlSeconds: Math.max(1, Math.ceil((e.expiresAt - Date.now()) / 1000)) };
  }

  clear(): void {
    this.map.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, e] of this.map) if (now >= e.expiresAt) this.map.delete(k);
  }
}

export class UpstashStore implements KVStore {
  readonly kind = 'upstash' as const;
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(key)) ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: Math.max(1, Math.round(ttlSeconds)) });
  }

  async setMany<T>(entries: Array<[string, T]>, ttlSeconds: number): Promise<void> {
    if (entries.length === 0) return;
    const p = this.redis.pipeline();
    for (const [k, v] of entries) p.set(k, v, { ex: Math.max(1, Math.round(ttlSeconds)) });
    await p.exec();
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number, by = 1): Promise<{ count: number; ttlSeconds: number }> {
    const count = await this.redis.incrby(key, by);
    if (count === by) {
      await this.redis.expire(key, Math.max(1, Math.round(ttlSeconds)));
      return { count, ttlSeconds };
    }
    let ttl = await this.redis.ttl(key);
    if (ttl < 0) {
      // A key without expiry would never reset; repair it.
      await this.redis.expire(key, Math.max(1, Math.round(ttlSeconds)));
      ttl = ttlSeconds;
    }
    return { count, ttlSeconds: ttl };
  }
}

export function upstashConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

const g = globalThis as unknown as { __ghStore?: KVStore };

export function getStore(): KVStore {
  if (!g.__ghStore) {
    const cfg = upstashConfigFromEnv();
    g.__ghStore = cfg ? new UpstashStore(new Redis({ url: cfg.url, token: cfg.token })) : new MemoryStore();
  }
  return g.__ghStore;
}

/** Tests only: swap or reset the store. */
export function setStoreForTests(store: KVStore | undefined): void {
  g.__ghStore = store;
}
