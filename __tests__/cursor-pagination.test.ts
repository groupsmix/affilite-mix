/**
 * C8-02: Tests for cursor pagination security — order column allow-list
 * and PostgREST metacharacter rejection in cursor values.
 */
import { describe, it, expect } from "vitest";
import { cursorPaginate } from "../lib/dal/cursor-pagination";

const fakeClient = () =>
  Promise.resolve({
    from: () => ({
      select: () => ({
        eq: () => ({
          or: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          order: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never);

describe("cursorPaginate security (C8-02 / I2-01)", () => {
  it("rejects orderColumn with PostgREST metacharacters", async () => {
    await expect(
      cursorPaginate(
        "products",
        {
          siteId: "test",
          orderColumn: "id),or=(role.eq.admin",
          select: "id, name",
        },
        fakeClient,
      ),
    ).rejects.toThrow(/Invalid orderColumn/);
  });

  it("rejects orderColumn not in the allow-list", async () => {
    await expect(
      cursorPaginate(
        "products",
        {
          siteId: "test",
          orderColumn: "password_hash",
          select: "id, name",
        },
        fakeClient,
      ),
    ).rejects.toThrow(/Invalid orderColumn/);
  });

  it("accepts default orderColumn (created_at)", async () => {
    const result = await cursorPaginate(
      "products",
      { siteId: "test", select: "id, name" },
      fakeClient,
    );
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("accepts allowed orderColumn (price)", async () => {
    const result = await cursorPaginate(
      "products",
      { siteId: "test", orderColumn: "price", select: "id, name" },
      fakeClient,
    );
    expect(result.data).toEqual([]);
  });
});
