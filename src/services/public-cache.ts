import { LRUCache } from "lru-cache";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const cache = new LRUCache<string, object>({ max: env.cacheMaxEntries, ttl: 5 * 60 * 1000 });
let version = 1;
// A deployment supplies one shared value for all API replicas. The instance fallback is
// deliberately unique, so an omitted deployment setting cannot make a browser accept a
// previous process's IndexedDB snapshot forever.
const browserCacheEpoch = env.publicBrowserCacheEpoch || `instance-${randomUUID()}`;

export const publicCache = {
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (!env.cacheEnabled) return loader();
    const cached = cache.get(key) as T | undefined;
    if (cached !== undefined) return cached;
    const loaded = await loader();
    cache.set(key, loaded as object);
    return loaded;
  },
  clear(group?: string): number {
    if (!group) {
      const count = cache.size;
      cache.clear();
      version += 1;
      return count;
    }
    let count = 0;
    for (const key of cache.keys()) {
      if (key.startsWith(`${group}:`)) {
        cache.delete(key);
        count += 1;
      }
    }
    version += 1;
    return count;
  },
  version: (): number => version,
  browserCacheEpoch: (): string => browserCacheEpoch,
  status: () => ({ enabled: env.cacheEnabled, entryCount: cache.size, maximumEntries: env.cacheMaxEntries, version, browserCacheEpoch }),
};
