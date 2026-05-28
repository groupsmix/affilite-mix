/**
 * SEC-02 (etap-3): canonical boolean env-var parser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("SEC-02: parseBoolEnv", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const TRUE_INPUTS = ["1", "true", "TRUE", "True", "yes", "YES", "on", "ON", " true ", "  1"];
  const FALSE_INPUTS = ["0", "false", "FALSE", "False", "no", "off", "OFF", ""];

  for (const v of TRUE_INPUTS) {
    it(`treats ${JSON.stringify(v)} as true`, async () => {
      vi.stubEnv("TEST_FLAG", v);
      const { parseBoolEnv } = await import("@/lib/env-bool");
      expect(parseBoolEnv("TEST_FLAG", false)).toBe(true);
    });
  }

  for (const v of FALSE_INPUTS) {
    it(`treats ${JSON.stringify(v)} as false`, async () => {
      vi.stubEnv("TEST_FLAG", v);
      const { parseBoolEnv } = await import("@/lib/env-bool");
      expect(parseBoolEnv("TEST_FLAG", true)).toBe(false);
    });
  }

  it("returns fallback when unset", async () => {
    vi.stubEnv("TEST_FLAG", undefined as unknown as string);
    const { parseBoolEnv } = await import("@/lib/env-bool");
    expect(parseBoolEnv("TEST_FLAG", true)).toBe(true);
    expect(parseBoolEnv("TEST_FLAG", false)).toBe(false);
  });

  it("warns and returns fallback for unrecognised values", async () => {
    vi.stubEnv("TEST_FLAG", "maybe");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { parseBoolEnv } = await import("@/lib/env-bool");
      expect(parseBoolEnv("TEST_FLAG", false)).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  describe("parseTriBoolEnv", () => {
    it("returns null for unset", async () => {
      vi.stubEnv("TEST_FLAG", undefined as unknown as string);
      const { parseTriBoolEnv } = await import("@/lib/env-bool");
      expect(parseTriBoolEnv("TEST_FLAG")).toBeNull();
    });

    it("returns null for empty string", async () => {
      vi.stubEnv("TEST_FLAG", "");
      const { parseTriBoolEnv } = await import("@/lib/env-bool");
      expect(parseTriBoolEnv("TEST_FLAG")).toBeNull();
    });

    it("returns explicit true / false for recognised inputs", async () => {
      vi.stubEnv("TEST_FLAG", "1");
      let { parseTriBoolEnv } = await import("@/lib/env-bool");
      expect(parseTriBoolEnv("TEST_FLAG")).toBe(true);

      vi.resetModules();
      vi.stubEnv("TEST_FLAG", "false");
      ({ parseTriBoolEnv } = await import("@/lib/env-bool"));
      expect(parseTriBoolEnv("TEST_FLAG")).toBe(false);
    });
  });
});

describe("SEC-02: admin-session flag accepts non-canonical booleans", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ADMIN_SESSION_STRICT=1 enables the umbrella (previously silently ignored)", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-env-bool-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload); // no request → no bnd claim

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    // SEC-02: "1" must now be accepted as truthy.
    vi.stubEnv("ADMIN_SESSION_STRICT", "1");
    vi.resetModules();
    const { verifyToken } = await import("@/lib/auth");
    // umbrella ON → missing bnd is rejected
    expect(await verifyToken(token)).toBeNull();
  });

  it("ADMIN_SESSION_BINDING_STRICT=yes individual flag overrides umbrella OFF", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-env-bool-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "yes");
    vi.resetModules();
    const { verifyToken } = await import("@/lib/auth");
    expect(await verifyToken(token)).toBeNull();
  });
});
