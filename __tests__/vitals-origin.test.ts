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
  const knownOrigin = `https://${knownSite!.domain}`;

  it("accepts an Origin matching a statically configured site domain", () => {
    expect(isOriginAllowed(knownOrigin, knownSite!.domain)).toBe(true);
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
    expect(isOriginAllowed(null, knownSite!.domain)).toBe(false);
    expect(isOriginAllowed("", knownSite!.domain)).toBe(false);
    expect(isOriginAllowed(undefined, knownSite!.domain)).toBe(false);
  });

  it("rejects an Origin from an unknown attacker domain", () => {
    expect(isOriginAllowed("https://evil.example.com", knownSite!.domain)).toBe(false);
  });

  it("ignores an unverified Host header (no static or DB registration)", () => {
    // Even if the request claims to come from an unknown host, the
    // attacker origin must not be added to the allow-list — the host
    // is not in `allSites`, `siteId` is absent, so verifiedHostname is
    // dropped.
    expect(isOriginAllowed("https://attacker.invalid", "attacker.invalid")).toBe(false);
  });

  it("strips the port from the Host header before lookup", () => {
    expect(isOriginAllowed(knownOrigin, `${knownSite!.domain}:443`)).toBe(true);
  });

  it("trusts a DB-registered custom domain when siteId is supplied", () => {
    // Wildcard / dashboard-managed custom domains are not in static
    // `allSites` config — middleware resolves them via the `sites` DB
    // row and injects `x-site-id`. When the route forwards that header
    // as `siteId`, the custom-domain Origin must be accepted.
    const customDomain = "coffee.wristnerd.xyz";
    const customOrigin = `https://${customDomain}`;
    expect(isOriginAllowed(customOrigin, customDomain)).toBe(false);
    expect(isOriginAllowed(customOrigin, customDomain, "site-id-123")).toBe(true);
  });

  it("still rejects an unknown origin even when siteId is supplied", () => {
    // `siteId` only upgrades the Host header to trusted — it does NOT
    // widen the allow-list to arbitrary origins. A mismatched Origin
    // must still 403.
    expect(isOriginAllowed("https://evil.example.com", "coffee.wristnerd.xyz", "site-id-123")).toBe(
      false,
    );
  });
});

describe("getAllowedOrigins shape", () => {
  it("includes every configured site domain", () => {
    const origins = getAllowedOrigins();
    for (const site of allSites) {
      expect(origins).toContain(`https://${site.domain}`);
    }
  });

  it("includes a verified site domain (and aliases) when supplied by the caller", () => {
    // G-33: signature now takes a `VerifiedSiteRef`, not a raw hostname,
    // so callers can only extend the allow-list with a site they have
    // already verified via static config OR a DB row lookup.
    const origins = getAllowedOrigins({
      slug: "custom-tenant",
      domain: "custom-tenant.example.com",
      aliases: ["www.custom-tenant.example.com"],
    });
    expect(origins).toContain("https://custom-tenant.example.com");
    expect(origins).toContain("https://www.custom-tenant.example.com");
  });

  it("does not extend the allow-list when no verified site is passed", () => {
    const origins = getAllowedOrigins(null);
    for (const site of allSites) {
      expect(origins).toContain(`https://${site.domain}`);
    }
  });
});
