import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPaginatedReports,
  normalizeAdmitadCommission,
  normalizeCjCommission,
  normalizePartnerStackCommission,
} from "@/lib/commission-adapters";
import { validateCommissionReport } from "@/lib/commission-validation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchPaginatedReports", () => {
  it("paginates until an empty page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 1 }, { id: 2 }] }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 3 }] }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPaginatedReports({
      label: "Test",
      buildUrl: (page) => `https://example.test/reports?page=${page}`,
      extractItems: (data) =>
        typeof data === "object" && data !== null ? (data as Record<string, unknown>).items : null,
    });

    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.test/reports?page=1",
      "https://example.test/reports?page=2",
      "https://example.test/reports?page=3",
    ]);
  });

  it("retries HTTP 500 with bounded backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 1 }] }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPaginatedReports({
      label: "Test",
      buildUrl: (page) => `https://example.test/reports?page=${page}`,
      extractItems: (data) =>
        typeof data === "object" && data !== null ? (data as Record<string, unknown>).items : null,
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a successful response with a malformed page envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ unexpected: [] })));

    await expect(
      fetchPaginatedReports({
        label: "Test",
        buildUrl: (page) => `https://example.test/reports?page=${page}`,
        extractItems: (data) =>
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>).items
            : null,
      }),
    ).rejects.toThrow("Test API response did not contain an array of reports");
  });

  it("fails instead of silently returning a partial result at the page cap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ items: [{ id: 1 }] })));

    await expect(
      fetchPaginatedReports({
        label: "Test",
        buildUrl: (page) => `https://example.test/reports?page=${page}`,
        extractItems: (data) =>
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>).items
            : null,
        maxPages: 1,
      }),
    ).rejects.toThrow("Test API pagination reached the 1-page safety limit");
  });
});

describe("commission normalizers", () => {
  it("preserves missing required values for schema validation instead of inventing defaults", () => {
    const candidates = [
      normalizeCjCommission({ shopperId: "tracking-1", actionId: "order-1" }),
      normalizeAdmitadCommission({ subid: "tracking-1", id: 42 }),
      normalizePartnerStackCommission({ customer_key: "tracking-1", key: "order-1" }),
    ];

    for (const candidate of candidates) {
      const result = validateCommissionReport(candidate);
      expect(result.data).toBeNull();
      expect(result.errors).toContain("commission_amount must be a finite number");
      expect(result.errors).toContain("event_date must be an ISO-8601 date/datetime");
    }
  });

  it("normalizes valid network payloads into validated commission reports", () => {
    const candidates = [
      normalizeCjCommission({
        shopperId: "tracking-cj",
        actionId: "cj-order",
        pubCommissionAmountUsd: 12.5,
        saleAmountUsd: 100,
        actionStatus: "new",
        eventDate: "2026-07-15T00:00:00Z",
      }),
      normalizeAdmitadCommission({
        subid: "tracking-admitad",
        id: 42,
        payment: 8,
        currency: "USD",
        status: "approved",
        action_date: "2026-07-15",
      }),
      normalizePartnerStackCommission({
        customer_key: "tracking-partnerstack",
        key: "ps-order",
        amount: 25,
        currency: "USD",
        status: "approved",
        created_at: "2026-07-15T00:00:00Z",
      }),
    ];

    for (const candidate of candidates) {
      expect(validateCommissionReport(candidate).errors).toBeNull();
    }
  });
});
