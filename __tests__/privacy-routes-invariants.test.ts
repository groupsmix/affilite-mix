/**
 * S11 test coverage: admin/privacy route invariants (#652)
 *
 * Ensures GDPR privacy routes (user, object, rectify, restrict) have
 * proper authorization, rate limiting, error handling, and validation.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function readRoute(subpath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, `../app/api/admin/privacy/${subpath}/route.ts`),
    "utf-8",
  );
}

const userRoute = readRoute("user");
const objectRoute = readRoute("object");
const rectifyRoute = readRoute("rectify");
const restrictRoute = readRoute("restrict");

const ALL_ROUTES = [
  { name: "user", src: userRoute },
  { name: "object", src: objectRoute },
  { name: "rectify", src: rectifyRoute },
  { name: "restrict", src: restrictRoute },
];

describe("privacy routes use withAuthz (not raw requireAdmin)", () => {
  for (const { name, src } of ALL_ROUTES) {
    it(`${name} route uses withAuthz`, () => {
      expect(src).toContain("withAuthz");
    });
  }
});

describe("privacy routes have rate limiting", () => {
  for (const { name, src } of ALL_ROUTES) {
    it(`${name} route has enforceAdminRateLimit`, () => {
      expect(src).toContain("enforceAdminRateLimit");
    });
  }
});

describe("privacy routes have error handling", () => {
  for (const { name, src } of ALL_ROUTES) {
    it(`${name} route captures exceptions via Sentry`, () => {
      expect(src).toContain("captureException");
    });
  }
});

describe("privacy routes use parseJsonBody for POST", () => {
  for (const { name, src } of ALL_ROUTES.filter((r) => r.src.includes("POST"))) {
    it(`${name} route uses parseJsonBody`, () => {
      expect(src).toContain("parseJsonBody");
    });
  }
});

describe("privacy/user route has audit logging", () => {
  it("records audit events for deletion", () => {
    expect(userRoute).toContain("recordAuditEvent");
  });
});

describe("privacy routes use privacy feature permission", () => {
  for (const { name, src } of ALL_ROUTES) {
    it(`${name} route scopes to privacy feature`, () => {
      expect(src).toMatch(/withAuthz\("privacy"/);
    });
  }
});
