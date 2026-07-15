import { describe, expect, it } from "vitest";
import { createPriceSnapshots } from "@/lib/dal/price-snapshots";

type GetClient = Parameters<typeof createPriceSnapshots>[1];

class FakeSupabase {
  payload: unknown = null;
  options: { onConflict?: string } | undefined;
  selectedColumns: string | undefined;

  from(table: string) {
    expect(table).toBe("price_snapshots");
    const self = this;
    const builder = {
      upsert(payload: unknown, options?: { onConflict?: string }) {
        self.payload = payload;
        self.options = options;
        return builder;
      },
      select(columns?: string) {
        self.selectedColumns = columns;
        return Promise.resolve({
          data: [
            {
              id: "snapshot-1",
              product_id: "product-1",
              site_id: "site-1",
              price_amount: 99,
              currency: "USD",
              source: "catalog_snapshot",
              snapshot_date: "2026-07-15",
              scraped_at: "2026-07-15T00:00:00Z",
              created_at: "2026-07-15T00:00:00Z",
            },
          ],
          error: null,
        });
      },
    };
    return builder;
  }
}

const asGetter = (fake: FakeSupabase): GetClient => (() => fake) as unknown as GetClient;

describe("createPriceSnapshots", () => {
  it("returns early without opening a client for empty input", async () => {
    let called = false;
    const result = await createPriceSnapshots([], (() => {
      called = true;
      throw new Error("unexpected client access");
    }) as GetClient);

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("upserts on the daily scoped key so cron retries are idempotent", async () => {
    const fake = new FakeSupabase();
    const inputs = [
      {
        product_id: "product-1",
        site_id: "site-1",
        price_amount: 99,
        currency: "USD",
        source: "catalog_snapshot",
        snapshot_date: "2026-07-15",
      },
    ];

    const result = await createPriceSnapshots(inputs, asGetter(fake));

    expect(fake.payload).toEqual(inputs);
    expect(fake.options?.onConflict).toBe("site_id,product_id,source,snapshot_date");
    expect(fake.selectedColumns).toContain("snapshot_date");
    expect(result).toHaveLength(1);
  });
});
