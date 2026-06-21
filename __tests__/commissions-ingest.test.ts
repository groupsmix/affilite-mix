/**
 * Bug 6 — `ingestCommissions` dedup/upsert behaviour.
 *
 * The DAL function accepts an injectable `getClient`, so these tests pass a
 * minimal recording stand-in for the supabase-js query builder instead of
 * hitting a real database. They lock in:
 *
 *   - upsert (not insert) with onConflict "site_id,network,order_id": the
 *     tenant-scoped arbiter (migration 2026062004). Identical (network, order_id)
 *     reported by two different sites must NOT dedup.
 *   - a deterministic synthetic order_id when a network omits one, so the same
 *     logical sale dedups across nightly runs instead of duplicating;
 *   - the preserved { inserted, skipped } return shape consumed by
 *     app/api/cron/commission-ingest/route.ts, with `skipped` now meaning
 *     "already present → refreshed in place".
 */
import { describe, it, expect, vi } from "vitest";
import { ingestCommissions, syntheticOrderId } from "@/lib/dal/commissions";

// The default client getter must never run — every test injects its own client.
vi.mock("@/lib/supabase-server", () => ({
  getTenantClient: () => {
    throw new Error("default client getter must not be used — tests inject getClient");
  },
}));

type Report = Parameters<typeof ingestCommissions>[0][number];
type GetClient = Parameters<typeof ingestCommissions>[1];

interface QueryResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

interface UpsertCall {
  payload: Record<string, unknown>;
  options: { onConflict?: string } | undefined;
}

/**
 * Records upsert calls and answers the two chains ingestCommissions uses:
 *   .from(t).select("id").eq("network", n).eq("order_id", o).maybeSingle()
 *   .from(t).upsert(row, { onConflict }).select("id").single()
 */
class FakeSupabase {
  readonly upserts: UpsertCall[] = [];
  error: { code?: string; message: string } | null = null;
  private readonly present: Set<string>;

  constructor(present: Iterable<string> = []) {
    this.present = new Set(present);
  }

  private static key(siteId: unknown, network: unknown, orderId: unknown): string {
    return `${String(siteId)}\u0000${String(network)}\u0000${String(orderId)}`;
  }

  from(_table: string) {
    const self = this;
    let network: string | undefined;
    let orderId: string | undefined;
    let siteId: string | undefined;
    let upsertPayload: Record<string, unknown> | undefined;

    const builder = {
      select(_cols?: string) {
        return builder;
      },
      eq(column: string, value: string) {
        if (column === "site_id") siteId = value;
        if (column === "network") network = value;
        if (column === "order_id") orderId = value;
        return builder;
      },
      upsert(payload: Record<string, unknown>, options?: { onConflict?: string }) {
        upsertPayload = payload;
        self.upserts.push({ payload, options });
        return builder;
      },
      maybeSingle(): Promise<QueryResult> {
        const exists = self.present.has(FakeSupabase.key(siteId, network, orderId));
        return Promise.resolve({ data: exists ? { id: "existing" } : null, error: null });
      },
      single(): Promise<QueryResult> {
        if (self.error) return Promise.resolve({ data: null, error: self.error });
        if (upsertPayload) {
          self.present.add(
            FakeSupabase.key(upsertPayload.site_id, upsertPayload.network, upsertPayload.order_id),
          );
        }
        return Promise.resolve({ data: { id: "row" }, error: null });
      },
    };
    return builder;
  }
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    site_id: "site-1",
    network: "cj",
    commission_amount: 10,
    event_date: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const asGetter = (fake: FakeSupabase): GetClient => (() => fake) as unknown as GetClient;

describe("syntheticOrderId", () => {
  it("is deterministic for identical inputs", () => {
    const r = {
      network: "cj",
      product_id: "p1",
      click_id: "c1",
      commission_amount: 12.5,
      sale_amount: 100,
      event_date: "2026-06-01T00:00:00Z",
    };
    expect(syntheticOrderId(r)).toBe(syntheticOrderId({ ...r }));
  });

  it("differs when any identifying field differs", () => {
    const base = { network: "cj", commission_amount: 1, event_date: "2026-06-01T00:00:00Z" };
    expect(syntheticOrderId(base)).not.toBe(syntheticOrderId({ ...base, network: "admitad" }));
    expect(syntheticOrderId(base)).not.toBe(syntheticOrderId({ ...base, commission_amount: 2 }));
  });

  it("has a stable, prefixed shape", () => {
    expect(syntheticOrderId({ network: "cj", commission_amount: 1, event_date: "x" })).toMatch(
      /^syn_[0-9a-f]{24}$/,
    );
  });
});

describe("ingestCommissions", () => {
  it("returns zeroes and never touches the client for empty input", async () => {
    const fake = new FakeSupabase();
    const res = await ingestCommissions([], asGetter(fake));
    expect(res).toEqual({ inserted: 0, skipped: 0 });
    expect(fake.upserts).toHaveLength(0);
  });

  it("upserts new rows with onConflict 'site_id,network,order_id' and counts them inserted", async () => {
    const fake = new FakeSupabase();
    const res = await ingestCommissions(
      [makeReport({ order_id: "o1" }), makeReport({ order_id: "o2" })],
      asGetter(fake),
    );
    expect(res).toEqual({ inserted: 2, skipped: 0 });
    expect(fake.upserts).toHaveLength(2);
    for (const u of fake.upserts) {
      expect(u.options?.onConflict).toBe("site_id,network,order_id");
    }
  });

  it("does NOT dedup identical (network, order_id) across different tenants (F12)", async () => {
    const fake = new FakeSupabase();
    const res = await ingestCommissions(
      [
        makeReport({ site_id: "site-A", network: "cj", order_id: "shared-1" }),
        makeReport({ site_id: "site-B", network: "cj", order_id: "shared-1" }),
      ],
      asGetter(fake),
    );
    // Two distinct sales: neither tenant's row may mask or clobber the other.
    expect(res).toEqual({ inserted: 2, skipped: 0 });
    expect(fake.upserts).toHaveLength(2);
    expect(fake.upserts[0]!.payload.site_id).toBe("site-A");
    expect(fake.upserts[1]!.payload.site_id).toBe("site-B");
  });

  it("synthesizes a deterministic order_id when the network omits one", async () => {
    const fake = new FakeSupabase();
    const report = makeReport({ order_id: undefined });
    await ingestCommissions([report], asGetter(fake));
    expect(fake.upserts[0]!.payload.order_id).toBe(syntheticOrderId(report));
    expect(String(fake.upserts[0]!.payload.order_id)).toMatch(/^syn_/);
  });

  it("dedups a re-ingested keyless report instead of duplicating it", async () => {
    const fake = new FakeSupabase();
    const report = makeReport({ order_id: undefined });
    const first = await ingestCommissions([report], asGetter(fake));
    const second = await ingestCommissions([report], asGetter(fake));
    expect(first).toEqual({ inserted: 1, skipped: 0 });
    expect(second).toEqual({ inserted: 0, skipped: 1 });
    expect(fake.upserts[0]!.payload.order_id).toBe(fake.upserts[1]!.payload.order_id);
  });

  it("counts an already-present row as skipped (refreshed) but still upserts it", async () => {
    const fake = new FakeSupabase(["site-1\u0000cj\u0000dup"]);
    const res = await ingestCommissions([makeReport({ order_id: "dup" })], asGetter(fake));
    expect(res).toEqual({ inserted: 0, skipped: 1 });
    expect(fake.upserts).toHaveLength(1);
  });

  it("throws when the upsert errors", async () => {
    const fake = new FakeSupabase();
    fake.error = { code: "23502", message: "null value in column" };
    await expect(
      ingestCommissions([makeReport({ order_id: "o1" })], asGetter(fake)),
    ).rejects.toMatchObject({ code: "23502" });
  });
});
