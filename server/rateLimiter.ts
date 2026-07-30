/**
 * Sliding-window rate limiter for the token endpoint, keyed by client IP.
 *
 * In-memory by design: on Vercel this bounds each warm serverless instance, so
 * treat it as best-effort abuse damping — the hard backstop is the access key
 * plus a budget cap on the API key, not this limiter.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** When denied, how long until the oldest counted request leaves the window. */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export interface RateLimiterOptions {
  /** Max allowed requests per key within the window. */
  limit: number;
  windowMs: number;
  now?: () => number;
}

/** Default budget for /api/token: ample for one family, hostile to scripts. */
export const TOKEN_RATE_LIMIT: Pick<RateLimiterOptions, "limit" | "windowMs"> = {
  limit: 10,
  windowMs: 60_000,
};

/** Sweep stale keys once the map grows past this, so memory stays bounded. */
const SWEEP_THRESHOLD = 1000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  const sweep = (cutoff: number): void => {
    if (hits.size < SWEEP_THRESHOLD) return;
    for (const [key, timestamps] of hits) {
      if (timestamps.every((t) => t <= cutoff)) hits.delete(key);
    }
  };

  return {
    check(key: string): RateLimitResult {
      const at = now();
      const cutoff = at - options.windowMs;
      sweep(cutoff);

      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        // recent[0] is the oldest still-counted hit; quota frees when it expires.
        return { allowed: false, retryAfterMs: recent[0] + options.windowMs - at };
      }

      hits.set(key, [...recent, at]);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
