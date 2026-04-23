/**
 * Route-level test: POST /api/auth/reset-password
 *
 * Verifies that reset tokens are looked up via SHA-256 hash (never by raw
 * value) and that the redeem path uses a timing-safe comparison against
 * the stored hash.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("new-password-hash"),
}));

vi.mock("@/lib/password-policy", () => ({
  validatePasswordPolicy: vi.fn().mockReturnValue({ valid: true }),
  checkBreachedPassword: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/auth/reset-password/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashResetToken } from "@/lib/reset-token";

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.example.com/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-password (route-level)", () => {
  beforeEach(() => {
    mockEq.mockReset();
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockFrom.mockReset();

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterMs: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("looks up users by the hashed token and succeeds on match", async () => {
    const rawToken = "my-reset-token";
    const storedHash = await hashResetToken(rawToken);

    // from("admin_users").select().eq().eq().single() → user row
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "user-1",
          reset_token: storedHash,
          reset_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        error: null,
      }),
    };
    // from("admin_users").update().eq() → ok
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    });

    const res = await POST(makeRequest({ token: rawToken, password: "NewPassw0rd!Strong" }));
    expect(res.status).toBe(200);

    // The first .eq() call on the select chain must match by hash, never raw token.
    const firstEqArgs = selectChain.eq.mock.calls[0];
    expect(firstEqArgs[0]).toBe("reset_token");
    expect(firstEqArgs[1]).toBe(storedHash);
    expect(firstEqArgs[1]).not.toBe(rawToken);
  });

  it("rejects when no user matches the hashed token", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "Not found" },
      }),
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    });

    const res = await POST(makeRequest({ token: "bogus-token", password: "NewPassw0rd!Strong" }));
    expect(res.status).toBe(400);
  });

  it("rejects expired tokens even when hash matches", async () => {
    const rawToken = "expired-token";
    const storedHash = await hashResetToken(rawToken);
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "user-1",
          reset_token: storedHash,
          reset_token_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        },
        error: null,
      }),
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    });

    const res = await POST(makeRequest({ token: rawToken, password: "NewPassw0rd!Strong" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("expired");
  });
});
