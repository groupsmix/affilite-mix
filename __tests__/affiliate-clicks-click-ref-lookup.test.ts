/**
 * `resolveClicksByRefs` is the commission-side half of per-click attribution:
 * it turns the references an affiliate network echoes back into the click,
 * site and product they were minted for.
 */
import { describe, expect, it } from "vitest";
import { resolveClicksByRefs } from "@/lib/dal/affiliate-clicks";

type GetClient = Parameters<typeof resolveClicksByRefs>[1];

interface ClickRow {
  click_ref: string | null;
  click_id: string | null;
  site_id: string | null;
  product_id: string | null;
}

class FakeClicksClient {
  readonly queries: string[][] = [];
  readonly noSiteFilterCalls: number[] = [];

  constructor(private readonly rowsByRef: Record<string, ClickRow>) {}

  from(_table: string) {
    const client = this;
    let refs: string[] = [];

    const builder = {
      select(_columns: string) {
        return builder;
      },
      unsafeNoSiteFilter() {
        client.noSiteFilterCalls.push(1);
        return builder;
      },
      in(_column: string, values: string[]) {
        refs = values;
        client.queries.push(values);
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?: ((value: { data: ClickRow[]; error: null }) => TResult1) | null,
        onRejected?: ((reason: unknown) => TResult2) | null,
      ): Promise<TResult1 | TResult2> {
        const data = refs
          .map((ref) => client.rowsByRef[ref])
          .filter((row): row is ClickRow => row !== undefined);
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }
}

const row = (overrides: Partial<ClickRow> = {}): ClickRow => ({
  click_ref: "9f3c1a7b2e5d0846",
  click_id: "click-1",
  site_id: "site-1",
  product_id: "product-1",
  ...overrides,
});

describe("resolveClicksByRefs", () => {
  it("returns the click, site and product behind a reference", async () => {
    const client = new FakeClicksClient({ "9f3c1a7b2e5d0846": row() });

    const resolved = await resolveClicksByRefs(
      ["9f3c1a7b2e5d0846"],
      (() => client) as unknown as GetClient,
    );

    expect(resolved.get("9f3c1a7b2e5d0846")).toEqual({
      click_id: "click-1",
      site_id: "site-1",
      product_id: "product-1",
    });
    // Attribution runs before the tenant is known, so the lookup is global.
    expect(client.noSiteFilterCalls).toHaveLength(1);
  });

  it("omits a click that carries no usable identity", async () => {
    const client = new FakeClicksClient({
      "9f3c1a7b2e5d0846": row({ click_id: null }),
      "0000000000000001": row({ click_ref: "0000000000000001", site_id: null }),
    });

    const resolved = await resolveClicksByRefs(
      ["9f3c1a7b2e5d0846", "0000000000000001"],
      (() => client) as unknown as GetClient,
    );

    expect(resolved.size).toBe(0);
  });

  it("keeps a click whose product is unknown", async () => {
    const client = new FakeClicksClient({ "9f3c1a7b2e5d0846": row({ product_id: null }) });

    const resolved = await resolveClicksByRefs(
      ["9f3c1a7b2e5d0846"],
      (() => client) as unknown as GetClient,
    );

    expect(resolved.get("9f3c1a7b2e5d0846")).toMatchObject({ product_id: null });
  });

  it("deduplicates references and queries them in bounded batches", async () => {
    const client = new FakeClicksClient({});
    const refs = Array.from({ length: 501 }, (_, index) => `ref-${index}`);
    refs.push("ref-0", "");

    await resolveClicksByRefs(refs, (() => client) as unknown as GetClient);

    expect(client.queries.map((query) => query.length)).toEqual([500, 1]);
  });

  it("issues no query when there is nothing to resolve", async () => {
    const client = new FakeClicksClient({});

    const resolved = await resolveClicksByRefs([""], (() => client) as unknown as GetClient);

    expect(resolved.size).toBe(0);
    expect(client.queries).toEqual([]);
  });
});
