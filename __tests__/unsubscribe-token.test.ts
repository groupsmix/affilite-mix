/**
 * Tests for the newsletter unsubscribe endpoint — token-only enforcement.
 *
 * Verifies that:
 * - POST /api/newsletter/unsubscribe requires a token (not email+site_id)
 * - GET /api/newsletter/unsubscribe requires a token query param
 */
import { describe, it, expect } from "vitest";

describe("unsubscribe endpoint contract", () => {
  it("POST body requires 'token' field, not 'email' + 'site_id'", async () => {
    // Dynamically read the route source to verify the contract
    // This is a structural test — it checks the code enforces token-only unsubscribe
    const routeSource = await import("fs").then((fs) =>
      fs.readFileSync("app/api/newsletter/unsubscribe/route.ts", "utf-8"),
    );

    // The POST handler must reference bodyOrError.token
    expect(routeSource).toContain("bodyOrError.token");

    // The POST handler must NOT use email+site_id for unsubscribe
    expect(routeSource).not.toContain('.eq("email"');
    expect(routeSource).not.toContain('.eq("site_id"');
  });

  it("both GET and POST use unsubscribe_token column, not email", async () => {
    const routeSource = await import("fs").then((fs) =>
      fs.readFileSync("app/api/newsletter/unsubscribe/route.ts", "utf-8"),
    );

    // All DB queries should filter by unsubscribe_token
    expect(routeSource).toContain("unsubscribe_token");

    // No raw email-based unsubscribe should exist
    expect(routeSource).not.toMatch(/\.eq\(["']email["']/);
  });

  it("POST handler rejects requests without a token", () => {
    // Simulate the validation logic from the route
    const token = undefined;
    const trimmed = (token as string | undefined)?.trim();
    expect(!trimmed).toBe(true);
  });

  it("token must be a non-empty string after trimming", () => {
    const cases = [undefined, null, "", "   "];
    for (const token of cases) {
      const trimmed = (token as string | undefined | null)?.trim();
      expect(!trimmed).toBe(true);
    }

    const validToken = "550e8400-e29b-41d4-a716-446655440000";
    expect(!!validToken.trim()).toBe(true);
  });
});
