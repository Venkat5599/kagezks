import { describe, it, expect, beforeEach } from "vitest";

// We test the rate-limit logic directly using the module.
// Since rateLimit uses a mutable Map, each test runs in isolation.
describe("rateLimit", () => {
  let rateLimit: typeof import("@/lib/rate-limit").rateLimit;
  let RATE_LIMITS: typeof import("@/lib/rate-limit").RATE_LIMITS;

  beforeEach(async () => {
    // Re-import to get a fresh store per test
    const mod = await import("@/lib/rate-limit");
    rateLimit = mod.rateLimit;
    RATE_LIMITS = mod.RATE_LIMITS;
  });

  function makeReq(ip = "1.2.3.4"): Request {
    return new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("allows requests within burst limit", () => {
    const req = makeReq();
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(req, { burst: 10, rate: 100 }, "test");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("blocks after exceeding burst", () => {
    const req = makeReq();
    const config = { burst: 3, rate: 0.0001 }; // essentially no refill
    // burn all tokens
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(req, config, "block").allowed).toBe(true);
    }
    // 4th should fail
    const blocked = rateLimit(req, config, "block");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("provides rate limit headers", () => {
    const req = makeReq();
    const result = rateLimit(req, RATE_LIMITS.api, "headers");
    expect(result.limit).toBe(RATE_LIMITS.api.burst);
    expect(typeof result.remaining).toBe("number");
    expect(typeof result.reset).toBe("number");
    expect(result.reset).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5);
  });

  it("separates rate limits by suffix", () => {
    const req = makeReq();
    const config = { burst: 3, rate: 0.0001 };

    // exhaust suffix "a"
    for (let i = 0; i < 3; i++) {
      rateLimit(req, config, "a");
    }
    expect(rateLimit(req, config, "a").allowed).toBe(false);

    // suffix "b" should still be fresh
    expect(rateLimit(req, config, "b").allowed).toBe(true);
    expect(rateLimit(req, config, "b").remaining).toBe(2);
  });

  it("separates rate limits by IP", () => {
    const reqA = makeReq("10.0.0.1");
    const reqB = makeReq("10.0.0.2");
    const config = { burst: 3, rate: 0.0001 };

    for (let i = 0; i < 3; i++) {
      rateLimit(reqA, config, "ip");
    }
    expect(rateLimit(reqA, config, "ip").allowed).toBe(false);
    expect(rateLimit(reqB, config, "ip").allowed).toBe(true);
  });
});
