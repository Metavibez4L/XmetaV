/**
 * TTL Cache — simple in-memory cache with per-key expiration.
 *
 * Usage:
 *   const cache = new TTLCache<FleetStatus>(30_000);  // 30s TTL
 *   const status = await cache.getOrFetch("fleet", () => fetchFleetStatus());
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly defaultTTL: number;

  /** @param ttlMs Default time-to-live in milliseconds */
  constructor(ttlMs: number) {
    this.defaultTTL = ttlMs;
  }

  /** Get a cached value, or fetch + cache it if missing/expired */
  async getOrFetch(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const existing = this.store.get(key);
    if (existing && Date.now() < existing.expiresAt) {
      return existing.value;
    }

    const value = await fetcher();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Get synchronously (returns undefined if missing/expired) */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() >= entry.expiresAt) {
      if (entry) this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Set a value with optional custom TTL */
  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  /** Invalidate a specific key */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Clear all entries */
  clear(): void {
    this.store.clear();
  }

  /** Number of entries (including possibly expired) */
  get size(): number {
    return this.store.size;
  }

  /** Prune expired entries (call periodically if cache is large) */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}
