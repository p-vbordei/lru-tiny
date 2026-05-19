import { describe, it, expect, vi } from "vitest";
import { LRU } from "../src/index.js";

class FakeClock {
  private t = 0;
  now = () => this.t;
  advance(ms: number) { this.t += ms; }
}

describe("basic LRU", () => {
  it("set / get / has", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.size).toBe(1);
  });

  it("evicts least-recently-used on overflow", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    c.set("d", 4);
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
  });

  it("get() updates recency", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    c.get("a");                          // a is now most-recent
    c.set("d", 4);                       // should evict b
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
  });

  it("peek does NOT update recency", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    c.peek("a");
    c.set("d", 4);                       // should still evict a (oldest)
    expect(c.has("a")).toBe(false);
  });

  it("delete returns true/false", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1);
    expect(c.delete("a")).toBe(true);
    expect(c.delete("a")).toBe(false);
  });

  it("clear empties", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1); c.set("b", 2);
    c.clear();
    expect(c.size).toBe(0);
  });

  it("re-setting an existing key updates recency", () => {
    const c = new LRU<string, number>(3);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    c.set("a", 11);  // a becomes most-recent and value updates
    c.set("d", 4);
    expect(c.has("a")).toBe(true);
    expect(c.get("a")).toBe(11);
    expect(c.has("b")).toBe(false);
  });

  it("rejects invalid maxSize", () => {
    expect(() => new LRU(0)).toThrow();
    expect(() => new LRU(-1)).toThrow();
    expect(() => new LRU(1.5)).toThrow();
  });
});

describe("TTL", () => {
  it("expires after ttlMs", () => {
    const clock = new FakeClock();
    const c = new LRU<string, number>(3, { ttlMs: 1000, now: clock.now });
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    clock.advance(1001);
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(0);  // pruned on access
  });

  it("per-call ttlMs override", () => {
    const clock = new FakeClock();
    const c = new LRU<string, number>(3, { ttlMs: 1000, now: clock.now });
    c.set("short", 1, { ttlMs: 100 });
    c.set("long", 2);
    clock.advance(500);
    expect(c.get("short")).toBeUndefined();
    expect(c.get("long")).toBe(2);
  });

  it("prune() removes expired entries", () => {
    const clock = new FakeClock();
    const c = new LRU<string, number>(5, { ttlMs: 100, now: clock.now });
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    clock.advance(101);
    expect(c.prune()).toBe(3);
    expect(c.size).toBe(0);
  });
});

describe("onEvict", () => {
  it("fires on capacity eviction", () => {
    const evicted: Array<[string, number, string]> = [];
    const c = new LRU<string, number>(2, { onEvict: (k, v, r) => evicted.push([k, v, r]) });
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    expect(evicted).toEqual([["a", 1, "capacity"]]);
  });

  it("fires on ttl eviction", () => {
    const clock = new FakeClock();
    const evicted: Array<[string, number, string]> = [];
    const c = new LRU<string, number>(3, {
      ttlMs: 100,
      now: clock.now,
      onEvict: (k, v, r) => evicted.push([k, v, r]),
    });
    c.set("a", 1);
    clock.advance(101);
    c.get("a");
    expect(evicted).toEqual([["a", 1, "ttl"]]);
  });

  it("fires on delete and clear", () => {
    const evicted: string[] = [];
    const c = new LRU<string, number>(3, { onEvict: (_k, _v, r) => evicted.push(r) });
    c.set("a", 1); c.set("b", 2);
    c.delete("a");
    c.clear();
    expect(evicted).toEqual(["delete", "clear"]);
  });
});

describe("iteration", () => {
  it("entries() yields least-recent to most-recent and skips expired", () => {
    const clock = new FakeClock();
    const c = new LRU<string, number>(3, { ttlMs: 100, now: clock.now });
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    clock.advance(50);
    c.set("b", 22);  // promote b
    const keys = [...c.keys()];
    expect(keys).toEqual(["a", "c", "b"]);
  });
});
