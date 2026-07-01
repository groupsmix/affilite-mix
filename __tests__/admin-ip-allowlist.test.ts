/**
 * Tests for the optional admin IP allow-list (defence-in-depth).
 *
 * Pins the safety-critical contract:
 *   - DISABLED by default (unset/empty env) — no request is ever blocked.
 *   - Fail-SAFE on misconfiguration (set-but-no-valid-entries) — stays disabled.
 *   - Fail-CLOSED when active and the client IP is unresolvable.
 *   - Exact + CIDR matching for both IPv4 and IPv6, with :: equivalence.
 *   - Only the admin surface (UI + API) is gated; exact path boundaries.
 *   - Blocked requests get a bare 404 (no admin-existence oracle).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enforceAdminIpAllowlist,
  isAdminPath,
  parseIp,
  __resetAdminIpAllowlistCacheForTests,
} from "@/lib/admin-ip-allowlist";

const ADMIN_URL = "https://example.com/q7m-k4j9/dashboard";
const ADMIN_API_URL = "https://example.com/api/admin/users";

function req(url: string, ip?: string): Request {
  const headers: Record<string, string> = {};
  if (ip !== undefined) headers["cf-connecting-ip"] = ip;
  return new Request(url, { headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetAdminIpAllowlistCacheForTests();
  delete process.env.ADMIN_IP_ALLOWLIST;
  // getClientIp trusts cf-connecting-ip by default; keep that explicit.
  delete process.env.TRUST_CF_CONNECTING_IP;
  delete process.env.TRUST_PROXY_HEADERS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  __resetAdminIpAllowlistCacheForTests();
});

describe("isAdminPath — exact boundaries", () => {
  it("matches the admin UI segment and its children", () => {
    expect(isAdminPath("/q7m-k4j9")).toBe(true);
    expect(isAdminPath("/q7m-k4j9/")).toBe(true);
    expect(isAdminPath("/q7m-k4j9/login")).toBe(true);
  });

  it("matches the admin API segment and its children", () => {
    expect(isAdminPath("/api/admin")).toBe(true);
    expect(isAdminPath("/api/admin/users")).toBe(true);
  });

  it("does not match look-alike paths", () => {
    expect(isAdminPath("/q7m-k4j9x")).toBe(false);
    expect(isAdminPath("/q7m-k4j9-foo")).toBe(false);
    expect(isAdminPath("/api/admins")).toBe(false);
    expect(isAdminPath("/api/administrator")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/about")).toBe(false);
  });
});

describe("parseIp", () => {
  it("parses IPv4", () => {
    expect(parseIp("1.2.3.4")).toEqual({ version: 4, bits: 0x01020304n });
    expect(parseIp("255.255.255.255")).toEqual({ version: 4, bits: 0xffffffffn });
  });

  it("rejects malformed IPv4", () => {
    expect(parseIp("1.2.3")).toBeNull();
    expect(parseIp("256.0.0.1")).toBeNull();
    expect(parseIp("1.2.3.4.5")).toBeNull();
    expect(parseIp("a.b.c.d")).toBeNull();
  });

  it("treats :: equivalent IPv6 forms identically", () => {
    const a = parseIp("2001:db8::1");
    const b = parseIp("2001:db8:0:0:0:0:0:1");
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("parses loopback and strips zone id", () => {
    expect(parseIp("::1")?.bits).toBe(1n);
    expect(parseIp("fe80::1%eth0")?.version).toBe(6);
  });

  it("rejects garbage", () => {
    expect(parseIp("")).toBeNull();
    expect(parseIp("not-an-ip")).toBeNull();
    expect(parseIp("2001:db8:::1")).toBeNull();
  });
});

describe("enforceAdminIpAllowlist — disabled by default", () => {
  it("returns null for admin paths when env is unset", () => {
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "9.9.9.9"))).toBeNull();
  });

  it("returns null for admin paths when env is empty/whitespace", () => {
    process.env.ADMIN_IP_ALLOWLIST = "   ";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "9.9.9.9"))).toBeNull();
  });
});

describe("enforceAdminIpAllowlist — fail-safe on misconfiguration", () => {
  it("stays disabled when set but no entries parse", () => {
    process.env.ADMIN_IP_ALLOWLIST = "garbage, also-bad, 999.999.999.999";
    // No valid entries → must NOT block (avoid self-lockout).
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "9.9.9.9"))).toBeNull();
  });
});

describe("enforceAdminIpAllowlist — active enforcement", () => {
  it("ignores non-admin paths even when active", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    expect(enforceAdminIpAllowlist(req("https://example.com/", "9.9.9.9"))).toBeNull();
    expect(enforceAdminIpAllowlist(req("https://example.com/products", "9.9.9.9"))).toBeNull();
  });

  it("allows an exact IPv4 match", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.113.7"))).toBeNull();
  });

  it("blocks an IPv4 outside the list with a 404", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    const res = enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.113.8"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(res!.headers.get("Cache-Control")).toContain("no-store");
    expect(res!.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("honours IPv4 CIDR ranges", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.0/24";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.113.200"))).toBeNull();
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.114.1"))!.status).toBe(404);
  });

  it("honours IPv6 CIDR ranges with :: equivalence", () => {
    process.env.ADMIN_IP_ALLOWLIST = "2001:db8::/32";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "2001:db8:0:0:0:0:0:5"))).toBeNull();
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "2001:db9::1"))!.status).toBe(404);
  });

  it("supports mixed lists and applies to the admin API too", () => {
    process.env.ADMIN_IP_ALLOWLIST = "10.0.0.1, 203.0.113.0/24 , 2001:db8::/32";
    expect(enforceAdminIpAllowlist(req(ADMIN_API_URL, "10.0.0.1"))).toBeNull();
    expect(enforceAdminIpAllowlist(req(ADMIN_API_URL, "10.0.0.2"))!.status).toBe(404);
  });

  it("fails closed when the client IP cannot be derived", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    // No cf-connecting-ip header and XFF untrusted → getClientIp returns "unknown".
    const res = enforceAdminIpAllowlist(req(ADMIN_URL));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("re-parses when the env value changes (cache correctness)", () => {
    process.env.ADMIN_IP_ALLOWLIST = "203.0.113.7";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.113.7"))).toBeNull();
    process.env.ADMIN_IP_ALLOWLIST = "198.51.100.1";
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "203.0.113.7"))!.status).toBe(404);
    expect(enforceAdminIpAllowlist(req(ADMIN_URL, "198.51.100.1"))).toBeNull();
  });
});

describe("middleware wiring — source drift guard", () => {
  const middlewareSrc = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

  it("imports and invokes the allow-list evaluator", () => {
    expect(middlewareSrc).toContain("enforceAdminIpAllowlist");
    expect(middlewareSrc).toContain("@/lib/admin-ip-allowlist");
  });

  it("runs the allow-list check before the AbortController allocation", () => {
    const callIdx = middlewareSrc.indexOf("enforceAdminIpAllowlist(request)");
    const abortIdx = middlewareSrc.search(/new AbortController\(\)/);
    expect(callIdx).toBeGreaterThan(0);
    expect(abortIdx).toBeGreaterThan(0);
    expect(callIdx).toBeLessThan(abortIdx);
  });

  it("runs the allow-list check after the retired-admin 410 branch", () => {
    const retiredIdx = middlewareSrc.indexOf("isRetiredAdminPath(request");
    const allowIdx = middlewareSrc.indexOf("enforceAdminIpAllowlist(request)");
    expect(retiredIdx).toBeGreaterThan(0);
    expect(allowIdx).toBeGreaterThan(retiredIdx);
  });
});
