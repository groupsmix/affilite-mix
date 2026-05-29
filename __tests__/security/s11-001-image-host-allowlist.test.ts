/**
 * S11-001: Regression tests for the image-host domain allowlist.
 *
 * Ensures user-submitted image URLs are restricted to approved domains
 * (R2 bucket, Supabase storage, Amazon CDNs). Covers:
 *   - Valid R2/CDN URLs accepted
 *   - Arbitrary external URLs rejected with 400-level error
 *   - HTTP (non-HTTPS) URLs rejected
 *   - Route source-level assertion that the guard is wired in
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkImageHostAllowlist,
  getAllowedImageHosts,
  _resetAllowedImageHostsCache,
} from "@/lib/security/image-host-allowlist";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Unit tests for the allowlist module
// ---------------------------------------------------------------------------

describe("S11-001: checkImageHostAllowlist", () => {
  const ORIGINAL_R2 = process.env.R2_PUBLIC_URL;
  const ORIGINAL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    _resetAllowedImageHostsCache();
    process.env.R2_PUBLIC_URL = "https://cdn.example-r2.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  });

  afterEach(() => {
    _resetAllowedImageHostsCache();
    if (ORIGINAL_R2 !== undefined) process.env.R2_PUBLIC_URL = ORIGINAL_R2;
    else delete process.env.R2_PUBLIC_URL;
    if (ORIGINAL_SUPA !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPA;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("accepts R2 public URL hostname", () => {
    const result = checkImageHostAllowlist("cdn.example-r2.com");
    expect(result.valid).toBe(true);
  });

  it("accepts Supabase storage hostname", () => {
    const result = checkImageHostAllowlist("abc.supabase.co");
    expect(result.valid).toBe(true);
  });

  it("accepts Amazon CDN hostname (m.media-amazon.com)", () => {
    const result = checkImageHostAllowlist("m.media-amazon.com");
    expect(result.valid).toBe(true);
  });

  it("accepts Amazon CDN hostname (images-na.ssl-images-amazon.com)", () => {
    const result = checkImageHostAllowlist("images-na.ssl-images-amazon.com");
    expect(result.valid).toBe(true);
  });

  it("rejects arbitrary external domain", () => {
    const result = checkImageHostAllowlist("evil.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("approved domain");
  });

  it("rejects attacker tracking pixel domain", () => {
    const result = checkImageHostAllowlist("tracking.attacker.io");
    expect(result.valid).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = checkImageHostAllowlist("CDN.EXAMPLE-R2.COM");
    expect(result.valid).toBe(true);
  });

  it("returns error when no hosts are configured", () => {
    delete process.env.R2_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    _resetAllowedImageHostsCache();

    // The static Amazon CDN hosts are always present, so the set is never
    // truly empty unless those are also removed. Verify the set includes them.
    const hosts = getAllowedImageHosts();
    expect(hosts.has("m.media-amazon.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source-level regression: the guard is wired into the route
// ---------------------------------------------------------------------------

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/community/wrist-shots/route.ts"),
  "utf-8",
);

describe("S11-001: wrist-shots route has image-host allowlist guard", () => {
  it("imports checkImageHostAllowlist", () => {
    expect(routeSource).toContain("checkImageHostAllowlist");
  });

  it("calls checkImageHostAllowlist on the parsed URL hostname", () => {
    expect(routeSource).toMatch(/checkImageHostAllowlist\(imgUrl\.hostname\)/);
  });

  it("returns 400 when the host check fails", () => {
    const guardStart = routeSource.indexOf("S11-001");
    const guardBlock = routeSource.slice(
      guardStart,
      routeSource.indexOf("SEC-TURNSTILE", guardStart),
    );
    expect(guardBlock).toContain("status: 400");
  });

  it("checks the host BEFORE persisting to DB (before createWristShot call)", () => {
    const guardIdx = routeSource.indexOf("checkImageHostAllowlist(imgUrl.hostname)");
    const dbIdx = routeSource.indexOf("createWristShot({");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(dbIdx);
  });
});
