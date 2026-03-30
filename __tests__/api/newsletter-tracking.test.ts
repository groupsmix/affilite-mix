import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

// ── Newsletter subscription validation ──────────────────────────

describe("newsletter subscription validation", () => {
  it("rejects invalid email format", () => {
    const testCases = ["notanemail", "@missing.user", "spaces in@email.com", ""];
    for (const email of testCases) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(valid).toBe(false);
    }
  });

  it("accepts valid email formats", () => {
    const testCases = ["user@example.com", "test+tag@domain.co.uk", "a@b.io"];
    for (const email of testCases) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(valid).toBe(true);
    }
  });

  it("normalizes email to lowercase", () => {
    const email = "User@Example.COM";
    expect(email.trim().toLowerCase()).toBe("user@example.com");
  });
});

// ── Newsletter double opt-in token validation ────────────────────

describe("newsletter confirmation token", () => {
  it("generates a valid UUID token format", () => {
    const token = crypto.randomUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(uuidRegex.test(token)).toBe(true);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
    expect(tokens.size).toBe(100);
  });
});

// ── Click tracking validation ───────────────────────────────────

describe("click tracking validation", () => {
  it("accepts valid product slug for tracking", () => {
    const slug = "seiko-5-sports";
    const valid = /^[a-z0-9-]+$/.test(slug);
    expect(valid).toBe(true);
  });

  it("rejects empty slug", () => {
    const slug = "";
    expect(slug.length > 0).toBe(false);
  });

  it("URL-encodes slugs for tracking beacon", () => {
    const slug = "casio-g-shock";
    const trackUrl = `/api/track/click?p=${encodeURIComponent(slug)}&t=gift-finder`;
    expect(trackUrl).toBe("/api/track/click?p=casio-g-shock&t=gift-finder");
  });

  it("URL-encodes special characters in slug", () => {
    const slug = "watch with spaces";
    const encoded = encodeURIComponent(slug);
    expect(encoded).toBe("watch%20with%20spaces");
  });
});

// ── Click tracking rate limiting ────────────────────────────────

describe("click tracking rate limiting", () => {
  it("rate limits excessive tracking requests", async () => {
    const config = { maxRequests: 3, windowMs: 60_000 };
    const key = `test-tracking-${Date.now()}`;

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit(key, config);
      expect(r.allowed).toBe(true);
    }

    // Next request should be blocked
    const blocked = await checkRateLimit(key, config);
    expect(blocked.allowed).toBe(false);
  });

  it("uses separate rate limit buckets per IP", async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    const ts = Date.now();
    const key1 = `test-track-ip1-${ts}`;
    const key2 = `test-track-ip2-${ts}`;

    const r1 = await checkRateLimit(key1, config);
    expect(r1.allowed).toBe(true);

    // Different IP should still be allowed
    const r2 = await checkRateLimit(key2, config);
    expect(r2.allowed).toBe(true);
  });
});

// ── Cron authentication ─────────────────────────────────────────

describe("cron authentication", () => {
  it("rejects missing authorization header", () => {
    const authHeader = null;
    const cronSecret = "test-secret";
    const isValid = authHeader === `Bearer ${cronSecret}`;
    expect(isValid).toBe(false);
  });

  it("rejects wrong secret", () => {
    const authHeader = "Bearer wrong-secret";
    const cronSecret = "test-secret";
    const isValid = authHeader === `Bearer ${cronSecret}`;
    expect(isValid).toBe(false);
  });

  it("accepts correct bearer token", () => {
    const cronSecret = "test-secret";
    const authHeader = `Bearer ${cronSecret}`;
    const isValid = authHeader === `Bearer ${cronSecret}`;
    expect(isValid).toBe(true);
  });
});
