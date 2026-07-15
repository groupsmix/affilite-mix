import { describe, expect, it } from "vitest";
import { resolveSitesByTrackingKeys } from "@/lib/dal/affiliate-tracking-keys";

type GetClient = Parameters<typeof resolveSitesByTrackingKeys>[2];

class TrackingKeyClient {
  readonly queries: string[][] = [];

  from(_table: string) {
    const client = this;
    let keys: string[] = [];

    const builder = {
      select(_columns: string) {
        return builder;
      },
      unsafeNoSiteFilter() {
        return builder;
      },
      eq(_column: string, _value: string) {
        return builder;
      },
      in(_column: string, values: string[]) {
        keys = values;
        client.queries.push(values);
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?:
          | ((value: {
              data: { tracking_key: string; site_id: string }[];
              error: null;
            }) => TResult1)
          | null,
        onRejected?: ((reason: unknown) => TResult2) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve({
          data: keys.map((key) => ({ tracking_key: key, site_id: `site-${key}` })),
          error: null,
        }).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }
}

describe("resolveSitesByTrackingKeys", () => {
  it("deduplicates keys and resolves them in bounded batches", async () => {
    const client = new TrackingKeyClient();
    const keys = Array.from({ length: 501 }, (_, index) => `key-${index}`);
    keys.push("key-0");

    const result = await resolveSitesByTrackingKeys(
      "cj",
      keys,
      (() => client) as unknown as GetClient,
    );

    expect(client.queries.map((query) => query.length)).toEqual([500, 1]);
    expect(result).toHaveLength(501);
    expect(result.get("key-0")).toBe("site-key-0");
    expect(result.get("key-500")).toBe("site-key-500");
  });

  it("does not create a client for empty input", async () => {
    let clientCreated = false;
    const result = await resolveSitesByTrackingKeys("cj", [], (() => {
      clientCreated = true;
      return new TrackingKeyClient();
    }) as unknown as GetClient);

    expect(result.size).toBe(0);
    expect(clientCreated).toBe(false);
  });
});
