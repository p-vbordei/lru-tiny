# lru-tiny

[![ci](https://github.com/p-vbordei/lru-tiny/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/lru-tiny/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/lru-tiny.svg)](https://www.npmjs.com/package/lru-tiny)
[![downloads](https://img.shields.io/npm/dm/lru-tiny.svg)](https://www.npmjs.com/package/lru-tiny)
[![bundle](https://img.shields.io/bundlejs/size/lru-tiny)](https://bundlejs.com/?q=lru-tiny)

> LRU cache with optional TTL, O(1) ops, onEvict hook, pluggable clock. ~150 LoC, zero dependencies.

```ts
import { LRU } from "lru-tiny";

const cache = new LRU<string, User>(1000, {
  ttlMs: 5 * 60_000,
  onEvict: (key, _val, reason) => metrics.inc(`cache.evict.${reason}`),
});

cache.set("u-1", user);
cache.get("u-1");            // hit, updates recency
cache.peek("u-1");           // hit, does NOT update recency
cache.has("u-1");            // boolean (respects TTL)
cache.delete("u-1");
cache.clear();
cache.size;                  // current count
cache.prune();               // proactively drop expired
```

## Install

```sh
npm install lru-tiny
```

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

`lru-cache` is the de-facto LRU package on npm but it's grown to ~30KB with options for memo, async fetch, dispose semantics, and more. For a typical cache use case you want:

- O(1) get/set/has
- A capacity cap
- Optional per-entry TTL
- A way to know when items get evicted

`lru-tiny` is that, in ~150 lines. Uses `Map`'s insertion-order iteration for O(1) LRU.

## Recipes

### Memoize an async function

```ts
import { LRU } from "lru-tiny";

function memoize<K, V>(fn: (key: K) => Promise<V>, capacity: number, ttlMs: number) {
  const cache = new LRU<K, Promise<V>>(capacity, { ttlMs });
  return (key: K): Promise<V> => {
    const cached = cache.get(key);
    if (cached) return cached;
    const promise = fn(key).catch((err) => {
      cache.delete(key);  // don't cache failures
      throw err;
    });
    cache.set(key, promise);
    return promise;
  };
}

const getUser = memoize((id: string) => api.getUser(id), 1000, 60_000);
```

### Response cache with cleanup metrics

```ts
import { LRU } from "lru-tiny";

const responses = new LRU<string, Response>(500, {
  ttlMs: 30_000,
  onEvict: (key, _val, reason) => {
    metrics.inc(`http.cache.evict.${reason}`);
  },
});

async function cachedFetch(url: string) {
  const cached = responses.get(url);
  if (cached) return cached.clone();
  const r = await fetch(url);
  responses.set(url, r.clone());
  return r;
}
```

### Periodic eviction sweeper

```ts
import { LRU } from "lru-tiny";

const cache = new LRU<string, Data>(10_000, { ttlMs: 60_000 });

// TTL is lazy — items aren't actively expired. Sweep every minute:
setInterval(() => {
  const removed = cache.prune();
  if (removed > 0) console.log(`evicted ${removed} expired entries`);
}, 60_000);
```

### Inspect cache state

```ts
import { LRU } from "lru-tiny";

const cache = new LRU<string, number>(100);

// Iterate from least-recent to most-recent
for (const [key, value] of cache.entries()) {
  console.log(key, value);
}

console.log(`size: ${cache.size} / ${cache.maxSize}`);
```

### Per-call TTL override

```ts
import { LRU } from "lru-tiny";

const cache = new LRU<string, Data>(100, { ttlMs: 60_000 });

cache.set("normal", data);                          // 60s TTL (default)
cache.set("short-lived", data, { ttlMs: 5_000 });   // 5s for this entry
cache.set("forever", data, { ttlMs: Infinity });    // never expires
```

## API

### `new LRU<K, V>(maxSize, opts?)`

| Option | Type | Default |
|---|---|---|
| `ttlMs` | `number` | none — entries never expire |
| `onEvict` | `(key, value, reason) => void` | none — `reason` is `"capacity"`, `"ttl"`, `"delete"`, or `"clear"` |
| `now` | `() => number` | `Date.now` — injectable for tests |

### Methods

- `get(key) → V | undefined` — updates recency on hit
- `peek(key) → V | undefined` — does NOT update recency
- `set(key, value, { ttlMs? }?)` — per-call TTL override; returns `this`
- `has(key) → boolean`
- `delete(key) → boolean`
- `clear()`
- `prune() → number` — actively drop expired (returns count removed)
- `entries()` / `keys()` / `values()` — least-recent first

### TTL is lazy

Expired entries aren't actively timed out — they're skipped on `get`/`has`/`peek` and dropped lazily then. For long-running processes with sparse access, call `prune()` periodically (or run it on a `setInterval`).

## Caveats

- **In-memory only.** For a multi-process cache, use Redis.
- **No async fetch helper.** Compose your own (see Recipes).
- **No size-by-bytes capacity.** Capacity is item count. For byte-aware caching, track sizes yourself in the value.

## License

Apache-2.0 © Vlad Bordei
