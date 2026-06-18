/**
 * Regression lock for the admin-dashboard "Admin Error" crash.
 *
 * The privileged service-role client exposes `.unsafeNoSiteFilter()` (the
 * F-API-01 opt-out marker). The RLS-enforced tenant / anon clients did NOT,
 * so any global-table DAL helper (admin_users, sites, …) that called
 * `.unsafeNoSiteFilter()` on a tenant/anon client threw
 * `TypeError: …unsafeNoSiteFilter is not a function`, crashing the Server
 * Component render (Settings / Users / platform tabs) and `getSiteRowBySlug`
 * on public layouts.
 *
 * `withNoopSiteFilterOptOut` (lib/supabase-server.ts) makes the marker a no-op
 * pass-through on those clients. These tests exercise the shim directly against
 * a fake PostgREST-style builder so they need no network, env, or live client.
 */
import { describe, it, expect, vi } from "vitest";
import { __withNoopSiteFilterOptOutForTests as withNoopSiteFilterOptOut } from "@/lib/supabase-server";

// Defensive: keep the supabase-server import graph leaf-clean in the vitest
// node environment. These modules are not exercised by the pure-shim
// assertions below (which only touch the exported helper).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => undefined }),
}));

/**
 * Minimal PostgREST-style chain builder: every method returns the builder so
 * `.from().select().eq()…` stays fluent. `unsafeNoSiteFilter` is intentionally
 * NOT declared — the real RLS clients lack it and the shim adds it at runtime,
 * so callers reach it through the index signature (typed `unknown`, matching
 * the shim's dynamic shape) and assert it explicitly.
 */
interface FakeBuilder {
  select: (...args: unknown[]) => FakeBuilder;
  eq: (...args: unknown[]) => FakeBuilder;
  in: (...args: unknown[]) => FakeBuilder;
  match: (...args: unknown[]) => FakeBuilder;
  order: (...args: unknown[]) => FakeBuilder;
  range: (...args: unknown[]) => FakeBuilder;
  limit: (...args: unknown[]) => FakeBuilder;
  single: (...args: unknown[]) => FakeBuilder;
  maybeSingle: (...args: unknown[]) => FakeBuilder;
  insert: (...args: unknown[]) => FakeBuilder;
  update: (...args: unknown[]) => FakeBuilder;
  delete: (...args: unknown[]) => FakeBuilder;
  upsert: (...args: unknown[]) => FakeBuilder;
  then: (resolve: (value: unknown) => unknown) => unknown;
  [key: string]: unknown;
}

interface FakeClient {
  from: (table: string) => FakeBuilder;
  rpc: (fn: string, args?: unknown) => FakeBuilder;
  auth: { getUser: () => string };
}

/**
 * Minimal stand-in for a supabase-js client + PostgREST builder: every chain
 * method records its name and returns the same builder; the builder is awaitable
 * and resolves to a `{ data, error }` result. It intentionally does NOT define
 * `unsafeNoSiteFilter`, mirroring the real RLS clients that lack it.
 */
function makeFakeClient(): { client: FakeClient; calls: string[] } {
  const calls: string[] = [];
  const builder: Record<string | symbol, unknown> = {};
  const chainMethods = [
    "select",
    "eq",
    "in",
    "match",
    "order",
    "range",
    "limit",
    "single",
    "maybeSingle",
    "insert",
    "update",
    "delete",
    "upsert",
  ];
  for (const m of chainMethods) {
    builder[m] = (..._args: unknown[]) => {
      calls.push(m);
      return builder;
    };
  }
  // Thenable: awaiting the builder resolves to a PostgREST-style result.
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });

  const client: FakeClient = {
    from: (_table: string) => builder as unknown as FakeBuilder,
    rpc: (_fn: string, _args?: unknown) => builder as unknown as FakeBuilder,
    auth: { getUser: () => "real-auth" },
  };
  return { client, calls };
}

function wrap(client: FakeClient): FakeClient {
  // The shim is generically typed for SupabaseClient; the fake satisfies the
  // intercepted shape (from/rpc) that the shim actually touches.
  return withNoopSiteFilterOptOut(client as never) as unknown as FakeClient;
}

describe("withNoopSiteFilterOptOut — RLS client .unsafeNoSiteFilter() shim", () => {
  it("adds a callable no-op .unsafeNoSiteFilter() to .from() chains", () => {
    const { client } = makeFakeClient();
    const wrapped = wrap(client);
    const builder = wrapped.from("admin_users").select("id");
    expect(typeof builder.unsafeNoSiteFilter).toBe("function");
    // Must not throw — this is the exact call that crashed the dashboard.
    expect(() => (builder.unsafeNoSiteFilter as () => unknown)()).not.toThrow();
  });

  it("keeps the chain intact and awaitable after the opt-out", async () => {
    const { client } = makeFakeClient();
    const wrapped = wrap(client);
    const afterOptOut = (
      wrapped.from("admin_users").select("id").unsafeNoSiteFilter as () => Record<string, unknown>
    )();
    expect(typeof afterOptOut.eq).toBe("function");
    const result = await (afterOptOut.eq as (...a: unknown[]) => PromiseLike<unknown>)("id", "x");
    expect(result).toEqual({ data: [], error: null });
  });

  it("adds the no-op opt-out to .rpc() chains too", () => {
    const { client } = makeFakeClient();
    const wrapped = wrap(client);
    const rpc = wrapped.rpc("increment_login_failed_attempts", {});
    expect(typeof rpc.unsafeNoSiteFilter).toBe("function");
    expect(() => (rpc.unsafeNoSiteFilter as () => unknown)()).not.toThrow();
  });

  it("forwards non-from/rpc client properties untouched", () => {
    const { client } = makeFakeClient();
    const wrapped = wrap(client);
    expect(wrapped.auth.getUser()).toBe("real-auth");
  });
});
