/**
 * Bug 6 — `ingestCommissions` dedup/upsert behaviour.
 *
 * The DAL function accepts an injectable `getClient`, so these tests pass a
 * minimal recording stand-in for the supabase-js query builder instead of
 * hitting a real database. They lock in:
 *
 *   - upsert (not insert) with onConflict "site_id,network,order_id" — the
 *     per-tenant arbiter backed by the unique index from migration 2026062101
 *     (which supersedes the site-blind 2026062003 dedup index so one tenant can
 *     no longer overwrite another's commission on a colliding order_id);
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

interface UpsertCall {
  payload: Record<string, unknown>[];
  options: { onConflict?: string } | undefined;
}

/**
 * Records upsert calls and answers the two chains ingestCommissions uses:
 *   .from(t).select(...).in("site_id", ...).in("network", ...).in("order_id", ...)
 *   .from(t).upsert(rows, { onConflict }).select("id")
 *
 * The dedup key mirrors the (site_id, network, order_id) unique index, so the
 * fake distinguishes tenants exactly as the database does.
 */
class FakeSupabase {
  readonly upserts: UpsertCall[] = [];
  error: { code?: string; message: string } | null = null;
  lookupError: { code?: string; message: string } | null = null;
  private readonly present: Set<string>;

  constructor(present: Iterable<string> = []) {
    this.present = new Set(present);
  }

  private static key(siteId: unknown, network: unknown, orderId: unknown): string {
    return `${String(siteId)}\u0000${String(network)}\u0000${String(orderId)}`;
  }

  from(_table: string) {
    const self = this;
    const filters = new Map<string, string[]>();
    let upsertPayload: Record<string, unknown>[] | undefined;
    let isUpsert = false;

    const builder = {
      select(_cols?: string) {
        return builder;
      },
      in(column: string, value: string[]) {
        filters.set(column, value);
        return builder;
      },
      upsert(payload: Record<string, unknown>[], options?: { onConflict?: string }) {
        isUpsert = true;
        upsertPayload = payload;
        self.upserts.push({ payload, options });
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?:
          | ((value: {
              data: unknown;
              error: { code?: string; message: string } | null;
            }) => TResult1)
          | null,
        onRejected?: ((reason: unknown) => TResult2) | null,
      ): Promise<TResult1 | TResult2> {
        const resolveResult = () => {
          if (isUpsert) {
            if (self.error) return { data: null, error: self.error };
            for (const row of upsertPayload ?? []) {
              self.present.add(FakeSupabase.key(row.site_id, row.network, row.order_id));
            }
            return {
              data: (upsertPayload ?? []).map((_row, index) => ({ id: `row-${index}` })),
              error: null,
            };
          }

          if (self.lookupError) return { data: null, error: self.lookupError };
          const data = Array.from(self.present)
            .map((key) => {
              const parts = key.split("\u0000");
              return {
                site_id: parts[0] ?? "",
                network: parts[1] ?? "",
                order_id: parts[2] ?? "",
              };
            })
            .filter(
              (row) =>
                filters.get("site_id")?.includes(row.site_id) &&
                filters.get("network")?.includes(row.network) &&
                filters.get("order_id")?.includes(row.order_id),
            );
          return { data, error: null };
        };

        return Promise.resolve(resolveResult()).then(onFulfilled, onRejected);
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
    expect(fake.upserts).toHaveLength(1);
    for (const u of fake.upserts) {
      expect(u.options?.onConflict).toBe("site_id,network,order_id");
    }
  });

  it("synthesizes a deterministic order_id when the network omits one", async () => {
    const fake = new FakeSupabase();
    const report = makeReport({ order_id: undefined });
    await ingestCommissions([report], asGetter(fake));
    expect(fake.upserts[0]!.payload[0]!.order_id).toBe(syntheticOrderId(report));
    expect(String(fake.upserts[0]!.payload[0]!.order_id)).toMatch(/^syn_/);
  });

  it("dedups a re-ingested keyless report instead of duplicating it", async () => {
    const fake = new FakeSupabase();
    const report = makeReport({ order_id: undefined });
    const first = await ingestCommissions([report], asGetter(fake));
    const second = await ingestCommissions([report], asGetter(fake));
    expect(first).toEqual({ inserted: 1, skipped: 0 });
    expect(second).toEqual({ inserted: 0, skipped: 1 });
    expect(fake.upserts[0]!.payload[0]!.order_id).toBe(fake.upserts[1]!.payload[0]!.order_id);
  });

  it("keeps a colliding synthetic order_id isolated per site (Finding #3 regression)", async () => {
    // Two tenants receive an identical keyless commission (same network, amount,
    // event_date) → identical syntheticOrderId. Before the fix the
    // (network, order_id) arbiter let the second tenant's row overwrite the
    // first; the (site_id, network, order_id) arbiter now keeps them distinct.
    const fake = new FakeSupabase();
    const a = makeReport({ site_id: "site-1", order_id: undefined });
    const b = makeReport({ site_id: "site-2", order_id: undefined });
    expect(syntheticOrderId(a)).toBe(syntheticOrderId(b)); // collision precondition
    const res = await ingestCommissions([a, b], asGetter(fake));
    expect(res).toEqual({ inserted: 2, skipped: 0 }); // both recorded, no overwrite
    expect(fake.upserts).toHaveLength(1);
  });

  it("counts an already-present row as skipped (refreshed) but still upserts it", async () => {
    const fake = new FakeSupabase(["site-1\u0000cj\u0000dup"]);
    const res = await ingestCommissions([makeReport({ order_id: "dup" })], asGetter(fake));
    expect(res).toEqual({ inserted: 0, skipped: 1 });
    expect(fake.upserts).toHaveLength(1);
  });

  it("deduplicates duplicate rows within one fetched batch", async () => {
    const fake = new FakeSupabase();
    const res = await ingestCommissions(
      [
        makeReport({ order_id: "dup", status: "pending" }),
        makeReport({ order_id: "dup", status: "approved" }),
      ],
      asGetter(fake),
    );

    expect(res).toEqual({ inserted: 1, skipped: 1 });
    expect(fake.upserts[0]!.payload).toHaveLength(1);
    expect(fake.upserts[0]!.payload[0]!.status).toBe("approved");
  });

  it("throws when the existing-row lookup errors", async () => {
    const fake = new FakeSupabase();
    fake.lookupError = { code: "PGRST000", message: "lookup failed" };
    await expect(
      ingestCommissions([makeReport({ order_id: "o1" })], asGetter(fake)),
    ).rejects.toMatchObject({ code: "PGRST000" });
  });

  it("throws when the upsert errors", async () => {
    const fake = new FakeSupabase();
    fake.error = { code: "23502", message: "null value in column" };
    await expect(
      ingestCommissions([makeReport({ order_id: "o1" })], asGetter(fake)),
    ).rejects.toMatchObject({ code: "23502" });
  });
});
