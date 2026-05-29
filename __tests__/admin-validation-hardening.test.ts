/**
 * S11 hardening: UUID validation on admin routes (#648, #656),
 * rate limiting on auth/logout (#644).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const usersRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/admin/users/route.ts"),
  "utf-8",
);
const contentRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/admin/content/route.ts"),
  "utf-8",
);
const logoutRoute = fs.readFileSync(
  path.resolve(__dirname, "../app/api/auth/logout/route.ts"),
  "utf-8",
);

describe("#656: admin/users UUID validation", () => {
  it("imports isUsableUuid", () => {
    expect(usersRoute).toContain("import { isUsableUuid }");
  });

  it("validates id in PATCH handler", () => {
    expect(usersRoute).toContain("isUsableUuid(id)");
  });

  it("validates id in DELETE handler", () => {
    const deleteSection = usersRoute.split("async function DELETE")[1];
    expect(deleteSection).toBeDefined();
    expect(deleteSection).toContain("isUsableUuid(id)");
  });

  it("returns 400 for invalid id format", () => {
    expect(usersRoute).toContain('"Invalid id format"');
  });
});

describe("#648: admin/content category_id UUID validation", () => {
  it("validates category_id as UUID", () => {
    expect(contentRoute).toContain("isUsableUuid(categoryId)");
  });

  it("returns 400 for invalid category_id format", () => {
    expect(contentRoute).toContain('"Invalid category_id format"');
  });
});

describe("#644: auth/logout rate limiting", () => {
  it("imports checkRateLimit", () => {
    expect(logoutRoute).toContain("import { checkRateLimit }");
  });

  it("imports getClientIp", () => {
    expect(logoutRoute).toContain("import { getClientIp }");
  });

  it("applies rate limit with logout key", () => {
    expect(logoutRoute).toContain("logout:");
  });

  it("returns 429 when rate limit exceeded", () => {
    expect(logoutRoute).toContain("429");
    expect(logoutRoute).toContain("Too many requests");
  });

  it("uses grace fail policy", () => {
    expect(logoutRoute).toContain('"grace"');
  });

  it("accepts NextRequest parameter for IP extraction", () => {
    expect(logoutRoute).toMatch(/POST\(request:\s*NextRequest\)/);
  });
});
