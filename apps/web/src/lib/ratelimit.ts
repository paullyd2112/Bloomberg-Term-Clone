import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";

// Distributed rate limiting via Upstash Redis.
// If env vars are absent, upstashConfigured is false and middleware
// falls back to its in-memory limiter (best-effort, per-instance).
const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

export const upstashConfigured = !!redis;

// Cache one limiter per (limit:window) combination.
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSec: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${limit}:${windowSec}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: "rl",
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Returns true if the request is allowed, false if rate-limited. */
export async function checkRateLimit(
  id: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const limiter = getLimiter(limit, windowSec);
  if (!limiter) return true; // not configured — let middleware fall back
  try {
    const { success } = await limiter.limit(id);
    return success;
  } catch {
    return true; // never block traffic on a Redis hiccup
  }
}
