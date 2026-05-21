import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToken, verifyToken } from "@/lib/auth";
import { __resetJwtSecretCacheForTests } from "@/lib/jwt-secret";

describe("JWT secret rotation", () => {
  beforeEach(() => {
    __resetJwtSecretCacheForTests();
  });

  it("accepts tokens signed with the current secret", async () => {
    vi.stubEnv("JWT_SECRET", "current-secret");
    vi.stubEnv("JWT_SECRET_PREVIOUS", "old-secret");

    const payload = { userId: "user-1", email: "test@test.com", role: "admin" as const };
    const token = await createToken(payload);
    
    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user-1");
  });

  it("accepts tokens signed with the previous secret", async () => {
    // 1. Sign with old secret
    vi.stubEnv("JWT_SECRET", "old-secret");
    const payload = { userId: "user-1", email: "test@test.com", role: "admin" as const };
    const token = await createToken(payload);

    // 2. Rotate: current is now new, previous is now old
    vi.stubEnv("JWT_SECRET", "new-secret");
    vi.stubEnv("JWT_SECRET_PREVIOUS", "old-secret");
    __resetJwtSecretCacheForTests();

    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user-1");
  });

  it("rejects tokens signed with an expired previous secret (simulated by removal)", async () => {
    // 1. Sign with old secret
    vi.stubEnv("JWT_SECRET", "old-secret");
    const token = await createToken({ userId: "1", email: "a@b.com", role: "admin" });

    // 2. Rotate and then eventually remove the old secret from PREVIOUS
    vi.stubEnv("JWT_SECRET", "new-secret");
    vi.stubEnv("JWT_SECRET_PREVIOUS", "different-old-secret");
    __resetJwtSecretCacheForTests();

    const decoded = await verifyToken(token);
    expect(decoded).toBeNull();
  });
});
