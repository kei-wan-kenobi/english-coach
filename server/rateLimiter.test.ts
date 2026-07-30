import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rateLimiter";

function clock(startMs = 0) {
  let t = startMs;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(true);
  });

  it("blocks once the limit is reached within the window", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    limiter.check("ip-1");
    limiter.check("ip-1");
    const result = limiter.check("ip-1");
    expect(result.allowed).toBe(false);
  });

  it("reports retryAfterMs until the oldest request leaves the window", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    limiter.check("ip-1"); // t=0
    c.tick(10_000);
    limiter.check("ip-1"); // t=10s
    c.tick(10_000); // t=20s; oldest (t=0) expires at t=60s
    const result = limiter.check("ip-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(40_000);
  });

  it("allows again after the window slides past old requests", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    limiter.check("ip-1");
    limiter.check("ip-1");
    c.tick(60_001);
    expect(limiter.check("ip-1").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-2").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(false);
  });

  it("a denied request does not consume quota (denials don't extend the block)", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    limiter.check("ip-1"); // t=0, consumes the slot
    c.tick(30_000);
    limiter.check("ip-1"); // denied at t=30s — must not count
    c.tick(30_001); // t=60.001s: original slot expired
    expect(limiter.check("ip-1").allowed).toBe(true);
  });
});
