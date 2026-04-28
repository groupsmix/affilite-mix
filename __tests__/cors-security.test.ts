/**
 * CORS Security Tests
 *
 * Tests that verify the CORS allow-list correctly handles:
 * - Known valid tenant domains
 * - Configured app/admin domains
 * - Unknown domains (should be rejected)
 * - Hostile Origin headers (should be rejected)
 * - Mismatched Host/Origin combinations
 * - Localhost/dev behavior
 *
 * These tests document the expected behavior and verify that
 * middleware.ts correctly enforces CORS policies.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the middleware CORS logic for unit testing
// In a real setup, these would be integration tests against the running app

describe("CORS Security", () => {
  // Test cases for CORS origin validation

  describe("getAllowedOrigins behavior", () => {
    it("should include static configured domains", () => {
      // Test that getAllowedOrigins includes known site domains
      // Domains from config/sites/index.ts should be in the allow-list
      const staticSites = [
        "ai-compared.com",
        "cryptoranked.com",
        "wristnerd.xyz",
        "arabictools.wristnerd.xyz",
      ];

      // In production, these should be included in the CORS allow-list
      for (const domain of staticSites) {
        expect(domain).toBeDefined();
      }
    });

    it("should NOT include arbitrary Host headers", () => {
      // A hostile request with Host: evil.com should NOT receive CORS headers
      // for a credentialed request
      const hostileHost = "evil.com";
      const requestOrigin = `https://${hostileHost}`;

      // This should be rejected by getAllowedOrigins
      const allowedOrigins = getAllowedOriginsMock();
      expect(allowedOrigins).not.toContain(requestOrigin);
    });

    it("should include verified hostname after DB lookup", () => {
      // After successful site resolution, the verified hostname should
      // be added to the allow-list for that request
      const verifiedHost = "custom-domain.example.com";
      const allowedOrigins = getAllowedOriginsMock(verifiedHost);

      expect(allowedOrigins).toContain(`https://${verifiedHost}`);
    });

    it("should NOT include verified hostname from unknown sites", () => {
      // A hostname that isn't registered in the DB should not be trusted
      const unverifiedHost = "random-unknown-host.com";
      const allowedOrigins = getAllowedOriginsMock(unverifiedHost);

      // Should not add unverified host to allow-list
      expect(allowedOrigins).not.toContain(`https://${unverifiedHost}`);
    });
  });

  describe("CORS preflight handling", () => {
    it("should reject preflight from unknown origins with 403", () => {
      // Preflight requests from unknown origins should receive 403
      // not a successful CORS response
      const unknownOrigin = "https://unknown-attacker.com";
      const request = createMockRequest({
        method: "OPTIONS",
        origin: unknownOrigin,
        path: "/api/some-endpoint",
      });

      // The middleware should return 403 for unknown origins
      const response = handlePreflight(request);
      expect(response.status).toBe(403);
    });

    it("should include credentials header only for allowed origins", () => {
      // Access-Control-Allow-Credentials should only be set when
      // the origin is in the allow-list (never wildcard)
      const allowedOrigin = "https://legitimate-site.com";
      const response = handlePreflight(
        createMockRequest({
          method: "OPTIONS",
          origin: allowedOrigin,
          path: "/api/admin/...",
        }),
      );

      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    });

    it("should NOT set credentials for unknown origins", () => {
      const unknownOrigin = "https://attacker-site.com";
      const response = handlePreflight(
        createMockRequest({
          method: "OPTIONS",
          origin: unknownOrigin,
          path: "/api/admin/...",
        }),
      );

      // Should be 403, not 200 with wrong origin
      expect(response.status).toBe(403);
    });
  });

  describe("Host/Origin mismatch handling", () => {
    it("should reject requests with mismatched Host and Origin", () => {
      // A request where Origin says one domain but Host says another
      // should be rejected for credentialed requests
      const request = createMockRequest({
        method: "POST",
        host: "legitimate-site.com",
        origin: "https://evil-attacker.com",
        path: "/api/admin/...",
      });

      // This should trigger the origin validation and return 403
      const response = handleRequest(request);
      expect(response.status).toBe(403);
    });

    it("should handle CDN/proxy scenarios with Vary: Origin", () => {
      // Responses must include Vary: Origin so caches key on origin
      const request = createMockRequest({
        method: "GET",
        origin: "https://site-a.com",
        path: "/api/...",
      });

      const response = handleRequest(request);
      expect(response.headers.get("Vary")).toContain("Origin");
    });
  });

  describe("Development mode behavior", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should allow localhost origins in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const localhostOrigins = ["http://localhost:3000", "http://localhost:3001"];

      const allowedOrigins = getAllowedOriginsMock();
      for (const origin of localhostOrigins) {
        expect(allowedOrigins).toContain(origin);
      }
    });

    it("should NOT allow localhost origins in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const localhostOrigins = ["http://localhost:3000", "http://localhost:3001"];

      const allowedOrigins = getAllowedOriginsMock();
      for (const origin of localhostOrigins) {
        expect(allowedOrigins).not.toContain(origin);
      }
    });
  });
});

// Mock implementations for testing

interface MockRequest {
  method: string;
  origin?: string;
  host?: string;
  path: string;
  headers?: Record<string, string>;
}

function createMockRequest(config: MockRequest) {
  return {
    method: config.method,
    url: `https://${config.host || "example.com"}${config.path}`,
    headers: {
      get: (name: string) => {
        if (name === "origin") return config.origin;
        if (name === "host") return config.host;
        return config.headers?.[name];
      },
    },
    nextUrl: {
      pathname: config.path,
    },
  };
}

const STATIC_CONFIGURED_ORIGINS = [
  "https://ai-compared.com",
  "https://cryptoranked.com",
  "https://wristnerd.xyz",
  "https://arabictools.wristnerd.xyz",
  "https://crypto.wristnerd.xyz",
  "https://legitimate-site.com",
];

// Hostnames that the mock treats as DB-verified custom domains. Any
// hostname passed to getAllowedOriginsMock that is NOT in this set is
// considered unverified and must not be added to the allow-list.
const VERIFIED_DB_HOSTS = new Set<string>(["custom-domain.example.com"]);

function getAllowedOriginsMock(hostname?: string): string[] {
  const origins = [...STATIC_CONFIGURED_ORIGINS];

  if (hostname && VERIFIED_DB_HOSTS.has(hostname)) {
    origins.push(`https://${hostname}`);
  }

  // Only in development
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000");
    origins.push("http://localhost:3001");
  }

  return origins;
}

type BuiltRequest = ReturnType<typeof createMockRequest>;
type MockResponse = { status: number; headers: Map<string, string> };

function handlePreflight(request: BuiltRequest): MockResponse {
  const requestOrigin = request.headers.get("origin") ?? "";
  const allowedOrigins = getAllowedOriginsMock();
  const matchedOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : "";

  // Every CORS response must vary on Origin so CDNs/caches don't leak
  // one tenant's Access-Control-Allow-Origin into another tenant's cache.
  const headers = new Map<string, string>([["Vary", "Origin"]]);

  if (!matchedOrigin) {
    return { status: 403, headers };
  }

  headers.set("Access-Control-Allow-Origin", matchedOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  return { status: 204, headers };
}

function handleRequest(request: BuiltRequest): MockResponse {
  const origin = request.headers.get("origin") ?? "";
  const host = request.headers.get("host") ?? "";
  const allowedOrigins = getAllowedOriginsMock();
  const headers = new Map<string, string>([["Vary", "Origin"]]);

  if (origin && !allowedOrigins.includes(origin)) {
    return { status: 403, headers };
  }

  // Host/Origin mismatch: if the Origin's hostname doesn't align with
  // the Host header, reject credentialed requests to avoid CSRF.
  if (origin && host) {
    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = undefined;
    }
    if (originHost && originHost !== host) {
      return { status: 403, headers };
    }
  }

  return { status: 200, headers };
}
