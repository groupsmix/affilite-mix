import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────
// Mock the admin-users DAL so authenticateUser runs in isolation from the DB.
vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserByEmail: vi.fn(),
  updateAdminUser: vi.fn(),
}));

// Spy on verifyPassword so we can assert it is always invoked.
vi.mock("@/lib/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/password")>();
  return {
    ...actual,
    verifyPassword: vi.fn(actual.verifyPassword),
  };
});

// ── Tests ────────────────────────────────────────────────────────

describe("authenticateUser timing-equalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs password verification when email is missing", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    const { verifyPassword } = await import("@/lib/password");
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");

    const result = await authenticateUser(undefined, "any-password");

    expect(result).toBeNull();
    // DAL should not be called when email is missing
    expect(vi.mocked(getAdminUserByEmail)).not.toHaveBeenCalled();
    // But verifyPassword must still run, against a non-empty hash
    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1);
    const [, hashArg] = vi.mocked(verifyPassword).mock.calls[0]!;
    expect(hashArg).toMatch(/^\$2[aby]\$/);
  });

  it("runs password verification when user is not found", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    const { verifyPassword } = await import("@/lib/password");
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");

    vi.mocked(getAdminUserByEmail).mockResolvedValueOnce(null);

    const result = await authenticateUser("missing@example.com", "any-password");

    expect(result).toBeNull();
    expect(vi.mocked(getAdminUserByEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1);
    const [, hashArg] = vi.mocked(verifyPassword).mock.calls[0]!;
    expect(hashArg).toMatch(/^\$2[aby]\$/);
  });

  it("never returns an authenticated payload for the dummy hash", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");

    vi.mocked(getAdminUserByEmail).mockResolvedValueOnce(null);

    // Even if an attacker somehow guessed the pre-image of the dummy hash,
    // authenticateUser must still return null because no real user was found.
    const result = await authenticateUser(
      "missing@example.com",
      "timing-equalizer-never-real-password",
    );
    expect(result).toBeNull();
  });
});
