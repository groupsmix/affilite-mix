/**
 * Unit tests for the `?u=` override guard (lib/affiliate/override-url-guard.ts).
 *
 * The override lets config-driven catalogs (dial guides, calm-routine picks,
 * the tool directory) send a destination that has no product row. Because the
 * value is attacker-controllable, the guard has to reject the shapes that turn
 * the click endpoint into a redirector or hand the commission to someone else.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  normalizeOverrideUrl,
  validateOverrideDestination,
} from "@/lib/affiliate/override-url-guard";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateOverrideDestination", () => {
  it("allows a plain merchant destination", () => {
    expect(validateOverrideDestination("https://www.amazon.com/dp/B01?tag=site-20")).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("allows a merchant destination carrying UTM parameters", () => {
    const result = validateOverrideDestination(
      "https://www.amazon.com/dp/B01?tag=site-20&utm_source=sticky&utm_medium=affiliate",
    );
    expect(result.allowed).toBe(true);
  });

  it("rejects a network redirector that can forward anywhere", () => {
    const result = validateOverrideDestination(
      "https://www.awin1.com/cread.php?awinmid=1&awinaffid=999&ued=" +
        encodeURIComponent("https://evil.example.com/phish"),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("redirector_network:awin");
  });

  it("rejects an embedded absolute URL on a merchant host", () => {
    const result = validateOverrideDestination(
      "https://www.walmart.com/go?next=" + encodeURIComponent("https://evil.example.com"),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("embedded_absolute_url");
  });

  it("rejects a protocol-relative destination smuggled in a query value", () => {
    const result = validateOverrideDestination(
      "https://www.walmart.com/go?next=%2F%2Fevil.example.com",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("embedded_absolute_url");
  });

  it("rejects an opaque shortener", () => {
    const result = validateOverrideDestination("https://amzn.to/3xYzAbc");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("opaque_redirector_host");
  });

  it("rejects a foreign Amazon associate tag when the site has one configured", () => {
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "site-20");
    const result = validateOverrideDestination("https://www.amazon.com/dp/B01?tag=attacker-20");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("foreign_publisher_id:tag");
  });

  it("accepts the site's own Amazon associate tag", () => {
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "site-20");
    expect(validateOverrideDestination("https://www.amazon.com/dp/B01?tag=site-20").allowed).toBe(
      true,
    );
  });

  it("accepts a tagless Amazon destination (no commission, but no substitution)", () => {
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "site-20");
    expect(validateOverrideDestination("https://www.amazon.com/dp/B01").allowed).toBe(true);
  });

  it("rejects an unparsable value", () => {
    expect(validateOverrideDestination("not-a-url").reason).toBe("unparsable_url");
  });

  it("rejects a non-https scheme", () => {
    expect(validateOverrideDestination("javascript:alert(1)").reason).toBe("non_https_scheme");
    expect(validateOverrideDestination("http://www.amazon.com/dp/B01").reason).toBe(
      "non_https_scheme",
    );
  });
});

describe("normalizeOverrideUrl", () => {
  it("returns a plain URL unchanged", () => {
    const url = "https://www.amazon.com/dp/B01?tag=site-20&utm_source=sticky";
    expect(normalizeOverrideUrl(url)).toBe(url);
  });

  it("decodes the legacy double-encoded form once", () => {
    const url = "https://www.amazon.com/dp/B01?tag=site-20&utm_source=sticky";
    expect(normalizeOverrideUrl(encodeURIComponent(url))).toBe(url);
  });

  it("returns null for a value that is not a URL under either encoding", () => {
    expect(normalizeOverrideUrl("www.amazon.com/dp/B01")).toBeNull();
    expect(normalizeOverrideUrl("")).toBeNull();
  });
});
