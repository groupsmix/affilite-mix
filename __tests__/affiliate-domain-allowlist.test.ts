/**
 * T-09: regression tests for the affiliate-domain allowlist used at both
 * write time (lib/validation.ts) and redirect time (app/api/track/click).
 *
 * These tests document the warn/strict semantics so the gate cannot
 * silently regress when AFFILIATE_DOMAIN_ENFORCEMENT flips to "strict"
 * in production.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  __resetAllowedDomainsCacheForTests,
  validateAffiliateDomain,
} from "@/lib/affiliate-domain-allowlist";

const originalEnforcement = process.env.AFFILIATE_DOMAIN_ENFORCEMENT;
const originalAllowed = process.env.AFFILIATE_ALLOWED_DOMAINS;

describe("validateAffiliateDomain", () => {
  beforeEach(() => {
    __resetAllowedDomainsCacheForTests();
  });

  afterEach(() => {
    if (originalEnforcement === undefined) {
      delete process.env.AFFILIATE_DOMAIN_ENFORCEMENT;
    } else {
      process.env.AFFILIATE_DOMAIN_ENFORCEMENT = originalEnforcement;
    }
    if (originalAllowed === undefined) {
      delete process.env.AFFILIATE_ALLOWED_DOMAINS;
    } else {
      process.env.AFFILIATE_ALLOWED_DOMAINS = originalAllowed;
    }
    __resetAllowedDomainsCacheForTests();
  });

  it("accepts well-known affiliate networks (Amazon)", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    const result = validateAffiliateDomain("https://www.amazon.com/dp/B0EXAMPLE?tag=test");
    expect(result.allowed).toBe(true);
    expect(result.domain).toBe("www.amazon.com");
  });

  it("accepts Sovrn shortlinks in strict mode", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    const result = validateAffiliateDomain("https://sovrn.co/1m9tdvu");
    expect(result.allowed).toBe(true);
    expect(result.domain).toBe("sovrn.co");
  });

  it("accepts subdomains of allow-listed registrable domains", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    const result = validateAffiliateDomain("https://hop.clickbank.net/?affiliate=foo&product=bar");
    expect(result.allowed).toBe(true);
  });

  it("strict mode rejects domains not on the allow-list", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    const result = validateAffiliateDomain("https://attacker.example/path");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not on the affiliate allow-list/);
  });

  it("warn mode allows off-list domains but reports a reason", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "warn";
    const result = validateAffiliateDomain("https://attacker.example/path");
    expect(result.allowed).toBe(true);
    expect(result.reason).toMatch(/not on the affiliate allow-list/);
  });

  it("rejects malformed URLs in either mode", () => {
    for (const mode of ["warn", "strict"]) {
      process.env.AFFILIATE_DOMAIN_ENFORCEMENT = mode;
      __resetAllowedDomainsCacheForTests();
      const result = validateAffiliateDomain("not a url");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Malformed URL");
    }
  });

  it("strict mode rejects javascript:/data: schemes (empty hostname)", () => {
    // The click route's redirect handler does its own scheme check,
    // but the allowlist also rejects these because the URL has no
    // hostname to match against the allow-list.
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    expect(validateAffiliateDomain("javascript:alert(1)").allowed).toBe(false);
    expect(validateAffiliateDomain("data:text/html,<script>alert(1)</script>").allowed).toBe(false);
  });

  it("honours AFFILIATE_ALLOWED_DOMAINS env override", () => {
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    process.env.AFFILIATE_ALLOWED_DOMAINS = "extra-network.com";
    __resetAllowedDomainsCacheForTests();
    const result = validateAffiliateDomain("https://promo.extra-network.com/x?ref=abc");
    expect(result.allowed).toBe(true);
  });
});
