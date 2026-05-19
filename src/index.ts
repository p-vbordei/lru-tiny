export interface LRUOptions<K, V> {
  /** Per-entry TTL in ms. Items past TTL are treated as missing and pruned lazily. */
  ttlMs?: number;
  /** Called for every eviction (capacity, ttl, delete, clear). */
  onEvict?: (key: K, value: V, reason: "capacity" | "ttl" | "delete" | "clear") => void;
  /** Injectable clock for tests. Default `Date.now`. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt?: number;
}

/**
 * Least-recently-used cache with optional TTL.
 *
 * - O(1) get/set/has/delete (relies on Map's insertion-order iteration).
 * - TTL is lazy: expired entries aren't actively timed out — they're skipped
 *   on access and pruned then. Call `prune()` periodically to free memory.
 */
export class LRU<K, V> {
  readonly maxSize: number;
  private readonly map = new Map<K, Entry<V>>();
  private readonly opts: LRUOptions<K, V>;
  private readonly now: () => number;

  constructor(maxSize: number, opts: LRUOptions<K, V> = {}) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error("maxSize must be a positive integer");
    }
    this.maxSize = maxSize;
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Lookup a key. Updates recency on hit. Returns `undefined` if missing or expired.
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.map.delete(key);
      this.opts.onEvict?.(key, entry.value, "ttl");
      return undefined;
    }
    // Promote to most-recent
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /**
   * Like `get` but does not update recency. Still respects TTL.
   */
  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) return undefined;
    return entry.value;
  }

  /**
   * Insert/update. May evict the least-recently-used entry if at capacity.
   * Per-call `ttlMs` overrides the constructor default.
   */
  set(key: K, value: V, opts: { ttlMs?: number } = {}): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest
      const firstKey = this.map.keys().next().value as K;
      const oldEntry = this.map.get(firstKey)!;
      this.map.delete(firstKey);
      this.opts.onEvict?.(firstKey, oldEntry.value, "capacity");
    }
    const ttl = opts.ttlMs ?? this.opts.ttlMs;
    const entry: Entry<V> = ttl !== undefined ? { value, expiresAt: this.now() + ttl } : { value };
    this.map.set(key, entry);
    return this;
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.map.delete(key);
      this.opts.onEvict?.(key, entry.value, "ttl");
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.map.delete(key);
    this.opts.onEvict?.(key, entry.value, "delete");
    return true;
  }

  clear(): void {
    if (this.opts.onEvict) {
      for (const [k, e] of this.map) this.opts.onEvict(k, e.value, "clear");
    }
    this.map.clear();
  }

  /** Drop all expired entries proactively. Returns number removed. */
  prune(): number {
    if (this.opts.ttlMs === undefined) return 0;
    const now = this.now();
    let removed = 0;
    for (const [k, e] of this.map) {
      if (e.expiresAt !== undefined && e.expiresAt <= now) {
        this.map.delete(k);
        this.opts.onEvict?.(k, e.value, "ttl");
        removed += 1;
      }
    }
    return removed;
  }

  /** Iterate live entries from least-recent to most-recent. Skips expired. */
  *entries(): IterableIterator<[K, V]> {
    const now = this.now();
    for (const [k, e] of this.map) {
      if (e.expiresAt !== undefined && e.expiresAt <= now) continue;
      yield [k, e.value];
    }
  }

  *keys(): IterableIterator<K> {
    for (const [k] of this.entries()) yield k;
  }

  *values(): IterableIterator<V> {
    for (const [, v] of this.entries()) yield v;
  }
}
