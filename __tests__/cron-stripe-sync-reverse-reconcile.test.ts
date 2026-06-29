/**
 * Issue 4 / Task C: The reverse-reconciliation pass in
 * /api/cron/stripe-sync must be ENTIRELY skipped when
 * STRIPE_REVERSE_RECONCILE_ENABLED !== "true" (the default). The pass makes
 * one Stripe API call per active member per cron tick and can deactivate
 * memberships, so it must be opt-in.
 *
 * These tests pin two invariants:
 *  1. Flag unset/false → stripe.subscriptions.retrieve is NEVER called and no
 *     membership deactivation update runs.
 *  2. Flag "true" → the pass runs and deactivates memberships whose Stripe
 *     sub is in a terminal state (canceled / incomplete_expired), while
 *     skipping rows whose retrieve throws (never deactivating on error).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Supabase builder mock ───────────────────────────────────────────
// The route chains `.from(t).select(...).unsafeNoSiteFilter().eq(...)...`.
// We record every query so the reverse-reconcile list query and the
// deactivation update can be asserted on independently.

type QueryLog = {
  table: string;
  // flat list of {matcher, value} applied, in order
  filters: Array<{ col: string; val: unknown; op: string }>;
  op: "select" | "update";
  updatePayload?: Record<string, unknown>;
};

const queries: QueryLog[] = [];
const selectResults: Record<string, { data: unknown; error: null } | undefined> = {};

function chainable(entry: QueryLog) {
  // Build a thenable that also exposes .unsafeNoSiteFilter()/.eq()/.not()/.single()/.maybeSingle()
  const resolve = () => {
    if (entry.op === "select") {
      const key = entry.filters.map((f) => `${f.col}${f.op}${String(f.val)}`).join("|");
      return (
        selectResults[`${entry.table}:${key}`] ??
        selectResults[entry.table] ?? { data: [], error: null }
      );
    }
    // update resolves to an empty result
    return { data: null, error: null };
  };

  const make = (): unknown => {
    const promise = Promise.resolve(resolve());
    const chain = {
      unsafeNoSiteFilter: () => chain,
      eq: (col: string, val: unknown) => {
        entry.filters.push({ col, val, op: "=" });
        return chain;
      },
      not: (col: string, _op: string, val: unknown) => {
        entry.filters.push({ col, val, op: "NOT" });
        return chain;
      },
      single: () => promise,
      maybeSingle: () => promise,
      then: (res: unknown, rej: unknown) => promise.then(res as never, rej as never),
    };
    return chain;
  };

  return make();
}

function buildSupabaseClient() {
  return {
    from: (table: string) => {
      const selectEntry: QueryLog = { table, filters: [], op: "select" };
      queries.push(selectEntry);
      const selectChain = chainable(selectEntry);
      return {
        select: () => selectChain,
        // update() must return a fresh chain that records its payload.
        update: (payload: Record<string, unknown>) => {
          const updateEntry: QueryLog = {
            table,
            filters: [],
            op: "update",
            updatePayload: payload,
          };
          queries.push(updateEntry);
          return chainable(updateEntry);
        },
      };
    },
  };
}

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => buildSupabaseClient(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: () => true,
}));

vi.mock("@/lib/cron-registry", () => ({
  getCronAuthOptionsForPath: () => ({}),
}));

vi.mock("@/lib/cron-liveness", () => ({
  recordCronLiveness: vi.fn(),
}));

vi.mock("@/lib/dal/stripe-events", () => ({
  getRecentStripeEventIds: vi.fn().mockResolvedValue(new Set<string>()),
}));

vi.mock("@/lib/stripe-event-processor", () => ({
  processStripeEvent: vi.fn().mockResolvedValue({ duplicate: true }),
}));

vi.mock("@/lib/stripe-reconciliation-policy", () => ({
  isReconcilableToActive: vi.fn().mockReturnValue(true),
}));

// Stripe mock: events.list + subscriptions.list return nothing (Phase 1/2
// no-ops). subscriptions.retrieve is the spy we assert on for the reverse pass.
const retrieveMock = vi.fn();
const stripeEventsListMock = vi.fn();
const stripeSubsListMock = vi.fn();

function makeAsyncIterator<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    events: { list: () => makeAsyncIterator(stripeEventsListMock() as unknown[]) },
    subscriptions: {
      list: () => makeAsyncIterator(stripeSubsListMock() as unknown[]),
      retrieve: retrieveMock,
    },
  }),
}));

beforeEach(() => {
  queries.length = 0;
  for (const k of Object.keys(selectResults)) delete selectResults[k];
  retrieveMock.mockReset();
  retrieveMock.mockResolvedValue({ id: "sub_x", status: "active" });
  stripeEventsListMock.mockReset();
  stripeSubsListMock.mockReset();
  stripeEventsListMock.mockReturnValue([]);
  stripeSubsListMock.mockReturnValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("stripe-sync reverse reconciliation (Issue 4)", () => {
  it("skips the entire reverse pass when STRIPE_REVERSE_RECONCILE_ENABLED is unset", async () => {
    // Flag intentionally unset (default-off).
    vi.stubEnv("STRIPE_REVERSE_RECONCILE_ENABLED", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");

    const { POST } = await import("@/app/api/cron/stripe-sync/route");
    const req = new Request("https://x/api/cron/stripe-sync", { method: "POST" });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    // The ONLY caller of subscriptions.retrieve is the reverse pass — so the
    // pass being skipped ⟺ retrieve was never called.
    expect(retrieveMock).not.toHaveBeenCalled();
    // No membership deactivation update should have run.
    const deactivations = queries.filter(
      (q) =>
        q.table === "memberships" && q.op === "update" && q.updatePayload?.status === "cancelled",
    );
    expect(deactivations).toHaveLength(0);
    const body = await res.json();
    expect(body.reverseChecked).toBe(0);
    expect(body.reverseReconciled).toBe(0);
  });

  it("skips the entire reverse pass when STRIPE_REVERSE_RECONCILE_ENABLED is explicitly false", async () => {
    vi.stubEnv("STRIPE_REVERSE_RECONCILE_ENABLED", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");

    const { POST } = await import("@/app/api/cron/stripe-sync/route");
    const req = new Request("https://x/api/cron/stripe-sync", { method: "POST" });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(retrieveMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.reverseChecked).toBe(0);
  });

  it("runs the pass and deactivates terminal subs, but skips rows whose retrieve throws", async () => {
    vi.stubEnv("STRIPE_REVERSE_RECONCILE_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");

    // Seed the reverse-reconcile list query: two active memberships with sub ids.
    selectResults["memberships"] = {
      data: [
        {
          id: "m1",
          site_id: "s1",
          email: "a@x",
          stripe_subscription_id: "sub_canceled",
          status: "active",
        },
        {
          id: "m2",
          site_id: "s2",
          email: "b@x",
          stripe_subscription_id: "sub_error",
          status: "active",
        },
      ],
      error: null,
    };
    // sub_canceled → terminal → deactivated. sub_error → retrieve throws → skipped.
    retrieveMock.mockImplementation((id: string) => {
      if (id === "sub_error") throw new Error("Stripe 503");
      return Promise.resolve({ id, status: "canceled" });
    });

    const { POST } = await import("@/app/api/cron/stripe-sync/route");
    const req = new Request("https://x/api/cron/stripe-sync", { method: "POST" });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reverseChecked).toBe(2);
    expect(body.reverseReconciled).toBe(1);
    expect(body.reverseSkipped).toBe(1);

    // Exactly one deactivation update (m1), none for m2.
    const deactivations = queries.filter(
      (q) =>
        q.table === "memberships" && q.op === "update" && q.updatePayload?.status === "cancelled",
    );
    expect(deactivations).toHaveLength(1);
    expect(deactivations[0]?.updatePayload?.cancelled_at).toBeTruthy();
  });

  it("does not deactivate when Stripe sub is in a transient (non-terminal) state", async () => {
    vi.stubEnv("STRIPE_REVERSE_RECONCILE_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");

    selectResults["memberships"] = {
      data: [
        {
          id: "m1",
          site_id: "s1",
          email: "a@x",
          stripe_subscription_id: "sub_pd",
          status: "active",
        },
      ],
      error: null,
    };
    retrieveMock.mockResolvedValue({ id: "sub_pd", status: "past_due" });

    const { POST } = await import("@/app/api/cron/stripe-sync/route");
    const req = new Request("https://x/api/cron/stripe-sync", { method: "POST" });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reverseReconciled).toBe(0);
    expect(body.reverseChecked).toBe(1);
    const deactivations = queries.filter(
      (q) =>
        q.table === "memberships" && q.op === "update" && q.updatePayload?.status === "cancelled",
    );
    expect(deactivations).toHaveLength(0);
  });
});
