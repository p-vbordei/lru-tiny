# lru-tiny

LRU cache with optional TTL. O(1) ops, `onEvict` hook, pluggable clock for tests. ~150 LoC, zero dependencies.

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

Expired entries aren't actively timed out — they're skipped on `get`/`has`/`peek` and dropped lazily then. For long-running processes with sparse access, call `prune()` periodically.

## License

Apache-2.0 © Vlad Bordei
