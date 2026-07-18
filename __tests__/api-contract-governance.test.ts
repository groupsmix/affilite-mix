import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { API_SCHEMA_COMPONENTS } from "@/lib/api-contract-schema";
import { API_ROUTE_METADATA_BY_PATH } from "@/lib/api-route-metadata";
import { API_VERSION_HEADER, CURRENT_API_VERSION, setApiVersionHeaders } from "@/lib/api-version";

const REPO_ROOT = path.resolve(__dirname, "..");

describe("API contract governance", () => {
  it("uses numeric major versions and a central response header helper", () => {
    const headers = new Headers();
    setApiVersionHeaders(headers);

    expect(CURRENT_API_VERSION).toMatch(/^[1-9]\d*$/);
    expect(headers.get(API_VERSION_HEADER)).toBe(CURRENT_API_VERSION);
  });

  it("covers middleware short-circuits and middleware-excluded API routes", () => {
    const middleware = readFileSync(path.join(REPO_ROOT, "middleware.ts"), "utf8");
    const nextConfig = readFileSync(path.join(REPO_ROOT, "next.config.ts"), "utf8");

    expect(middleware).toContain("finalizeApiVersionResponse(request, result)");
    expect(nextConfig).toContain('source: "/api/:path*"');
    expect(nextConfig).toContain("API_VERSION_HEADER");
    expect(nextConfig).toContain("CURRENT_API_VERSION");
  });

  it("keeps representative route contracts linked to registered schemas", () => {
    const paths = ["/api/auth/csrf", "/api/auth/me", "/api/health", "/api/newsletter"];

    for (const routePath of paths) {
      const contract = API_ROUTE_METADATA_BY_PATH.get(routePath)?.contract;
      expect(contract, `${routePath} must declare a machine-readable contract`).toBeDefined();

      if (contract?.requestSchema) {
        expect(API_SCHEMA_COMPONENTS).toHaveProperty(contract.requestSchema);
      }
      for (const response of Object.values(contract?.responses ?? {})) {
        expect(API_SCHEMA_COMPONENTS).toHaveProperty(response.schema);
      }
    }
  });

  it("keeps the generated OpenAPI artifact aligned with the contract model", () => {
    const openapi = readFileSync(path.join(REPO_ROOT, "openapi.yaml"), "utf8");

    expect(openapi).toContain(`version: "${CURRENT_API_VERSION}"`);
    expect(openapi).toContain("API-Version:");
    expect(openapi).toContain('$ref: "#/components/schemas/ApiError"');
    expect(openapi).toContain('$ref: "#/components/schemas/HealthResponse"');
    expect(openapi).toContain('$ref: "#/components/schemas/NewsletterSignupRequest"');
  });

  it("uses the standard error envelope on representative public/auth routes", () => {
    const routes = [
      "app/api/auth/csrf/route.ts",
      "app/api/auth/me/route.ts",
      "app/api/health/route.ts",
      "app/api/newsletter/route.ts",
    ];

    for (const route of routes) {
      const source = readFileSync(path.join(REPO_ROOT, route), "utf8");
      expect(source, route).toContain('from "@/lib/api-error"');
      expect(source, route).toContain("apiError(");
    }
  });
});
