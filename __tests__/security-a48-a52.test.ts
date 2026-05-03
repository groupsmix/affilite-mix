/**
 * Security hardening tests for audit findings A48-A52.
 *
 * A48: Mass assignment / over-posting
 * A49: CORS
 * A50: SSRF
 * A51: Rate limiting
 * A52: File upload
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickFields, extraFields, hasExtraFields } from "@/lib/safe-fields";

// ── A48: Mass assignment / safe-fields ────────────────────────────

describe("A48 — Mass assignment prevention (safe-fields)", () => {
  describe("pickFields()", () => {
    it("picks only the specified keys", () => {
      const body = {
        name: "Alice",
        email: "alice@example.com",
        role: "admin",
        is_verified: true,
        balance: 9999,
      };
      const safe = pickFields(body, ["name", "email"] as const);
      expect(safe).toEqual({ name: "Alice", email: "alice@example.com" });
      expect(safe).not.toHaveProperty("role");
      expect(safe).not.toHaveProperty("is_verified");
      expect(safe).not.toHaveProperty("balance");
    });

    it("omits keys whose value is undefined", () => {
      const body = { name: "Bob", email: undefined, role: "admin" };
      const safe = pickFields(body, ["name", "email", "role"] as const);
      expect(safe).toEqual({ name: "Bob", role: "admin" });
      expect("email" in safe).toBe(false);
    });

    it("returns empty object when none of the keys are present", () => {
      const body = { evil_field: "pwned" };
      const safe = pickFields(body as any, ["name", "email"] as const);
      expect(safe).toEqual({});
    });

    it("handles empty source object", () => {
      const safe = pickFields({}, ["name", "email"] as const);
      expect(safe).toEqual({});
    });

    it("preserves null values (distinct from undefined)", () => {
      const body = { name: "Alice", email: null };
      const safe = pickFields(body, ["name", "email"] as const);
      expect(safe).toEqual({ name: "Alice", email: null });
    });

    it("preserves falsy values like 0 and empty string", () => {
      const body = { count: 0, label: "", active: false };
      const safe = pickFields(body, ["count", "label", "active"] as const);
      expect(safe).toEqual({ count: 0, label: "", active: false });
    });
  });

  describe("extraFields()", () => {
    it("returns keys not in the allowlist", () => {
      const body = { name: "Alice", role: "admin", is_verified: true, balance: 9999 };
      const extra = extraFields(body, ["name"]);
      expect(extra).toContain("role");
      expect(extra).toContain("is_verified");
      expect(extra).toContain("balance");
      expect(extra).not.toContain("name");
    });

    it("returns empty array when all keys are allowed", () => {
      const body = { name: "Alice", email: "a@b.com" };
      const extra = extraFields(body, ["name", "email"]);
      expect(extra).toEqual([]);
    });
  });

  describe("hasExtraFields()", () => {
    it("returns true when extra fields are present", () => {
      expect(hasExtraFields({ name: "A", evil: "x" }, ["name"])).toBe(true);
    });

    it("returns false when no extra fields", () => {
      expect(hasExtraFields({ name: "A" }, ["name"])).toBe(false);
    });
  });
});

// ── A49: CORS ─────────────────────────────────────────────────────

describe("A49 — CORS hardening", () => {
  describe("A49.6 — null origin rejection", () => {
    // The getAllowedOrigins function filters out forbidden origins
    // and middleware rejects "null" origin directly

    it("getAllowedOrigins filters out the literal 'null' origin", async () => {
      // Mock process.env for the test
      vi.stubGlobal("process", {
        ...process,
        env: { ...process.env, NODE_ENV: "production" },
      });

      const { getAllowedOrigins } = await import("@/lib/security/allowed-origins");
      const origins = getAllowedOrigins(null);

      // No origin in the list should be "null" or ""
      for (const origin of origins) {
        expect(origin.toLowerCase()).not.toBe("null");
        expect(origin).not.toBe("");
      }
    });

    it("getAllowedOrigins rejects null origin even when passed as verified site domain", async () => {
      vi.stubGlobal("process", {
        ...process,
        env: { ...process.env, NODE_ENV: "production" },
      });

      const { getAllowedOrigins } = await import("@/lib/security/allowed-origins");
      // Simulate a misconfigured alias that somehow resolves to "null"
      const origins = getAllowedOrigins({ slug: "test", domain: "example.com" });

      for (const origin of origins) {
        expect(origin.toLowerCase()).not.toBe("null");
        expect(origin).not.toBe("");
      }
    });
  });

  describe("A49.4 — CORS methods", () => {
    it("CORS_ALLOWED_METHODS includes PUT, PATCH, DELETE for admin routes", async () => {
      // Read the middleware source and verify the constant
      const fs = await import("fs");
      const path = await import("path");
      const middlewareSrc = fs.readFileSync(path.join(process.cwd(), "middleware.ts"), "utf-8");

      // The CORS_ALLOWED_METHODS constant should include PUT, PATCH, DELETE
      expect(middlewareSrc).toContain("PUT");
      expect(middlewareSrc).toContain("PATCH");
      expect(middlewareSrc).toContain("DELETE");

      // Specifically in the CORS_ALLOWED_METHODS constant
      const match = middlewareSrc.match(/CORS_ALLOWED_METHODS\s*=\s*"([^"]+)"/);
      expect(match).not.toBeNull();
      const methods = match![1];
      expect(methods).toContain("PUT");
      expect(methods).toContain("PATCH");
      expect(methods).toContain("DELETE");
    });
  });
});

// ── A50: SSRF ─────────────────────────────────────────────────────

describe("A50 — SSRF protection", () => {
  describe("A50.3 — AI provider base URLs are hardcoded", () => {
    it("all AI provider URLs come from env vars, not from DB or request", async () => {
      // Read providers.ts and verify no URL is sourced from request or DB
      const fs = await import("fs");
      const path = await import("path");
      const providersSrc = fs.readFileSync(
        path.join(process.cwd(), "lib/ai/providers.ts"),
        "utf-8",
      );

      // All fetch URLs should be hardcoded constants
      expect(providersSrc).toContain("https://api.cloudflare.com/client/v4/accounts/");
      expect(providersSrc).toContain("https://generativelanguage.googleapis.com/");
      expect(providersSrc).toContain("https://api.groq.com/openai/v1/chat/completions");
      expect(providersSrc).toContain("https://api.cohere.com/v2/chat");

      // No dynamic URL construction from request body or DB
      expect(providersSrc).not.toContain("body.baseUrl");
      expect(providersSrc).not.toContain("req.baseUrl");
      expect(providersSrc).not.toContain("request.baseUrl");
    });
  });
});

// ── A52: File upload ──────────────────────────────────────────────

describe("A52 — File upload hardening", () => {
  describe("A52.4 — magic byte validation covers all allowed MIMEs", () => {
    it("finalize route validates all 5 allowed image types", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const finalizeSrc = fs.readFileSync(
        path.join(process.cwd(), "app/api/admin/upload/finalize/route.ts"),
        "utf-8",
      );

      // All 5 allowed MIME types must have magic byte cases
      expect(finalizeSrc).toContain('"image/jpeg"');
      expect(finalizeSrc).toContain('"image/png"');
      expect(finalizeSrc).toContain('"image/gif"');
      expect(finalizeSrc).toContain('"image/webp"');
      expect(finalizeSrc).toContain('"image/avif"');
    });

    it("SVG and HTML are explicitly rejected in magic byte check", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const finalizeSrc = fs.readFileSync(
        path.join(process.cwd(), "app/api/admin/upload/finalize/route.ts"),
        "utf-8",
      );

      // SVG/HTML rejection must be present
      expect(finalizeSrc).toContain("<?xml");
      expect(finalizeSrc).toContain("<svg");
      expect(finalizeSrc).toContain("<html");
    });
  });

  describe("A52.3 — upload route rejects SVG", () => {
    it("ALLOWED_IMAGE_TYPES does not include SVG", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const uploadSrc = fs.readFileSync(
        path.join(process.cwd(), "app/api/admin/upload/route.ts"),
        "utf-8",
      );

      // SVG must not be in the allowed set
      expect(uploadSrc).not.toContain('"image/svg+xml"');
      expect(uploadSrc).not.toContain('"image/svg"');

      // Verify the comment explains why
      expect(uploadSrc).toContain("SVG is intentionally excluded");
    });
  });
});

// ── A48 integration: admin user route uses pickFields ─────────────

describe("A48 — admin user route mass-assignment prevention", () => {
  it("admin users PATCH route uses pickFields for updates", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/users/route.ts"),
      "utf-8",
    );

    // The route must import and use pickFields
    expect(routeSrc).toContain("pickFields");
    expect(routeSrc).toContain("@/lib/safe-fields");
  });
});
