/**
 * Bug 8 (audit-round2-fixes): Unit tests for the atomic TOTP compare-and-set
 * DAL helper `verifyAndSetTotpStep` (lib/dal/admin-users.ts).
 *
 * The RPC must return exactly the boolean Postgres produced — `true` when one
 * row advanced (first use / newer step), `false` when zero rows updated (the
 * step was already consumed → replay). On any RPC error the helper must throw
 * (fail-closed) so the caller can reject the login instead of silently
 * re-introducing the non-atomic TOCTOU race.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a fake supabase client whose `.rpc()` resolves to a configurable
// {data, error} and records the call args.
function makeClient(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpcPromise = Promise.resolve(result);
  const chain = {
    unsafeNoSiteFilter: () => chain,
    then: (res: unknown, rej: unknown) => rpcPromise.then(res as never, rej as never),
  };
  return {
    client: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return chain;
      },
    },
    calls,
  };
}

describe("verifyAndSetTotpStep (Bug 8)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when the RPC reports one row updated (accepted)", async () => {
    const { client, calls } = makeClient({ data: true, error: null });
    vi.doMock("@/lib/server-only/service-role", () => ({
      getPrivilegedSupabaseClient: () => client,
    }));
    vi.doMock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
    vi.doMock("@/lib/sentry", () => ({ captureException: vi.fn() }));
    vi.doMock("@/lib/metrics", () => ({ emitMetric: vi.fn() }));

    const { verifyAndSetTotpStep } = await import("@/lib/dal/admin-users");
    const accepted = await verifyAndSetTotpStep("user-1", 42, 42);

    expect(accepted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("verify_and_set_totp_step");
    expect(calls[0]?.args).toEqual({
      p_user_id: "user-1",
      p_expected_step: 42,
      p_new_step: 42,
    });
  });

  it("returns false when the RPC reports zero rows updated (replay)", async () => {
    const { client } = makeClient({ data: false, error: null });
    vi.doMock("@/lib/server-only/service-role", () => ({
      getPrivilegedSupabaseClient: () => client,
    }));
    vi.doMock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
    vi.doMock("@/lib/sentry", () => ({ captureException: vi.fn() }));
    vi.doMock("@/lib/metrics", () => ({ emitMetric: vi.fn() }));

    const { verifyAndSetTotpStep } = await import("@/lib/dal/admin-users");
    const accepted = await verifyAndSetTotpStep("user-1", 42, 42);
    expect(accepted).toBe(false);
  });

  it("throws (fail-closed) when the RPC errors — does not fall back to non-atomic write", async () => {
    const { client } = makeClient({
      data: null,
      error: { code: "42883", message: "function does not exist" },
    });
    vi.doMock("@/lib/server-only/service-role", () => ({
      getPrivilegedSupabaseClient: () => client,
    }));
    const sentryCapture = vi.fn();
    vi.doMock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
    vi.doMock("@/lib/sentry", () => ({ captureException: sentryCapture }));
    vi.doMock("@/lib/metrics", () => ({ emitMetric: vi.fn() }));

    const { verifyAndSetTotpStep } = await import("@/lib/dal/admin-users");
    await expect(verifyAndSetTotpStep("user-1", 42, 42)).rejects.toThrow();
    expect(sentryCapture).toHaveBeenCalled();
  });
});
