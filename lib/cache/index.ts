import { getStore, MemoryStore } from '../store';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Cache backed by the shared store (Upstash on Vercel, memory locally). */
class StoreCache implements Cache {
  async get<T>(key: string): Promise<T | null> {
    return getStore().get<T>(`cache:${key}`);
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await getStore().set(`cache:${key}`, value, ttlSeconds);
  }
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
  async delete(key: string): Promise<void> {
    await getStore().del(`cache:${key}`);
  }
}

/** Stand-alone in-memory cache (tests; same JSON round-trip semantics as Redis). */
export class MemoryCache implements Cache {
  private store = new MemoryStore();
  get<T>(key: string) { return this.store.get<T>(key); }
  set<T>(key: string, value: T, ttlSeconds: number) { return this.store.set(key, value, ttlSeconds); }
  async has(key: string) { return (await this.store.get(key)) !== null; }
  delete(key: string) { return this.store.del(key); }
}

const storeCache = new StoreCache();

export function getCache(): Cache {
  return storeCache;
}

/** Profile responses (library + playtime) are cached for about an hour. */
export const PROFILE_CACHE_TTL_SECONDS = 60 * 60;
