/**
 * Rate limiting for API routes.
 * Token bucket algorithm — per-IP with configurable burst + sustained rate.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const threshold = now - 10 * 60 * 1000; // remove entries older than 10 min
  for (const [key, entry] of store) {
    if (entry.lastRefill < threshold) store.delete(key);
  }
}

export interface RateLimitConfig {
  burst: number; // max tokens in bucket
  rate: number; // tokens per second
}

export const RATE_LIMITS = {
  api: { burst: 30, rate: 2 },
  auth: { burst: 5, rate: 0.5 },
  strict: { burst: 3, rate: 0.2 },
} as const satisfies Record<string, RateLimitConfig>;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // unix timestamp when bucket refills
}

/**
 * Check rate limit for a request. Returns result with headers.
 */
export function rateLimit(
  request: Request,
  config: RateLimitConfig,
  suffix = ""
): RateLimitResult {
  cleanup();

  // Use X-Forwarded-For in production (Vercel), fall back to connection address
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "127.0.0.1";
  const key = `rate:${ip}:${suffix}`;

  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { tokens: config.burst, lastRefill: now };
    store.set(key, entry);
  }

  // Refill tokens
  const elapsed = (now - entry.lastRefill) / 1000;
  entry.tokens = Math.min(config.burst, entry.tokens + elapsed * config.rate);
  entry.lastRefill = now;

  const allowed = entry.tokens >= 1;
  if (allowed) {
    entry.tokens -= 1;
  }

  const resetTime = Math.ceil(
    now + ((config.burst - entry.tokens) / config.rate) * 1000
  );
  const reset = Math.floor(resetTime / 1000);

  return {
    allowed,
    limit: config.burst,
    remaining: Math.floor(entry.tokens),
    reset,
  };
}

/**
 * Generate standard rate limit headers.
 */
export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
    ...(!result.allowed && { "Retry-After": String(Math.max(1, result.reset - Math.floor(Date.now() / 1000))) }),
  };
}
