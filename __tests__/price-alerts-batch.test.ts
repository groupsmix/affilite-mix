import { describe, expect, it } from "vitest";
import { findTriggeredAlertsForProducts, type PriceAlertRow } from "@/lib/dal/price-alerts";

type GetClient = Parameters<typeof findTriggeredAlertsForProducts>[1];

function makeAlert(overrides: Partial<PriceAlertRow> = {}): PriceAlertRow {
  return {
    id: "alert-1",
    product_id: "product-1",
    site_id: "site-1",
    email: "reader@example.com",
    target_price: 100,
    currency: "USD",
    is_active: true,
    triggered_at: null,
    created_at: "2026-07-15T00:00:00Z",
    updated_at: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

class FakeSupabase {
  readonly filters: { method: "eq" | "in"; column: string; value: unknown }[] = [];

  constructor(
    private readonly rows: PriceAlertRow[],
    private readonly error: { message: string } | null = null,
  ) {}

  from(table: string) {
    expect(table).toBe("price_alerts");
    const self = this;
    const builder = {
      select() {
        return builder;
      },
      in(column: string, value: string[]) {
        self.filters.push({ method: "in", column, value });
        return builder;
      },
      eq(column: string, value: unknown) {
        self.filters.push({ method: "eq", column, value });
        return Promise.resolve({ data: self.error ? null : self.rows, error: self.error });
      },
    };
    return builder;
  }
}

const asGetter = (fake: FakeSupabase): GetClient => (() => fake) as unknown as GetClient;

describe("findTriggeredAlertsForProducts", () => {
  it("returns early without opening a client for empty input", async () => {
    let called = false;
    const result = await findTriggeredAlertsForProducts([], (() => {
      called = true;
      throw new Error("unexpected client access");
    }) as GetClient);

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("uses one bounded query and applies each product's current price", async () => {
    const fake = new FakeSupabase([
      makeAlert({ id: "triggered-1", target_price: 100 }),
      makeAlert({ id: "too-low", target_price: 49 }),
      makeAlert({
        id: "triggered-2",
        site_id: "site-2",
        product_id: "product-2",
        target_price: 25,
      }),
      makeAlert({
        id: "unrequested",
        site_id: "site-3",
        product_id: "product-3",
        target_price: 1_000,
      }),
    ]);

    const result = await findTriggeredAlertsForProducts(
      [
        { site_id: "site-1", product_id: "product-1", current_price: 50 },
        { site_id: "site-2", product_id: "product-2", current_price: 20 },
      ],
      asGetter(fake),
    );

    expect(result.map((alert) => alert.id)).toEqual(["triggered-1", "triggered-2"]);
    expect(fake.filters).toEqual([
      { method: "in", column: "site_id", value: ["site-1", "site-2"] },
      { method: "in", column: "product_id", value: ["product-1", "product-2"] },
      { method: "eq", column: "is_active", value: true },
    ]);
  });

  it("propagates query errors", async () => {
    const fake = new FakeSupabase([], { message: "database unavailable" });

    await expect(
      findTriggeredAlertsForProducts(
        [{ site_id: "site-1", product_id: "product-1", current_price: 50 }],
        asGetter(fake),
      ),
    ).rejects.toMatchObject({ message: "database unavailable" });
  });
});
