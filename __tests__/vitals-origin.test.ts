/**
 * G-47: /api/vitals — Origin allow-list enforcement.
 *
 * The vitals beacon endpoint is intentionally exempt from the CSRF
 * double-submit token (sendBeacon() cannot attach custom headers), so the
 * route relies on `isOriginAllowed` to make sure beacons cannot be fired
 * cross-origin from arbitrary attacker pages.
 */

import { describe, it, expect } from "vitest";

import { isOriginAllowed, getAllowedOrigins } from "@/lib/security/allowed-origins";
import { allSites } from "@/config/sites";

describe("isOriginAllowed (G-47 vitals origin guard)", () => {
  const knownSite = allSites[0];
  const knownOrigin = `https://${knownSite.domain}`;

  it("accepts an Origin matching a statically configured site domain", () => {
    expect(isOriginAllowed(knownOrigin, knownSite.domain)).toBe(true);
  });

  it("accepts an Origin matching a configured alias", () => {
    const siteWithAlias = allSites.find((s) => s.aliases && s.aliases.length > 0);
    if (!siteWithAlias?.aliases) {
      // Skip when the static config has no aliases (defensive — should not happen).
      return;
    }
    const aliasOrigin = `https://${siteWithAlias.aliases[0]}`;
    expect(isOriginAllowed(aliasOrigin, siteWithAlias.domain)).toBe(true);
  });

  it("rejects a missing/empty Origin header", () => {
    expect(isOriginAllowed(null, knownSite.domain)).toBe(false);
    expect(isOriginAllowed("", knownSite.domain)).toBe(false);
    expect(isOriginAllowed(undefined, knownSite.domain)).toBe(false);
  });

  it("rejects an Origin from an unknown attacker domain", () => {
    expect(isOriginAllowed("https://evil.example.com", knownSite.domain)).toBe(false);
  });

  it("ignores an unverified Host header (no static or DB registration)", () => {
    // Even if the request claims to come from an unknown host, the
    // attacker origin must not be added to the allow-list — the host
    // is not in `allSites`, so `getSiteByDomain` returns undefined and
    // verifiedHostname is dropped.
    expect(isOriginAllowed("https://attacker.invalid", "attacker.invalid")).toBe(false);
  });

  it("strips the port from the Host header before lookup", () => {
    expect(isOriginAllowed(knownOrigin, `${knownSite.domain}:443`)).toBe(true);
  });
});

describe("getAllowedOrigins shape", () => {
  it("includes every configured site domain", () => {
    const origins = getAllowedOrigins();
    for (const site of allSites) {
      expect(origins).toContain(`https://${site.domain}`);
    }
  });

  it("includes a verified hostname when explicitly trusted by the caller", () => {
    const origins = getAllowedOrigins("custom-tenant.example.com");
    expect(origins).toContain("https://custom-tenant.example.com");
  });
});
