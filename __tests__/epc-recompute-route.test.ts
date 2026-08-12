import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  getPrivilegedSupabaseClient: vi.fn(),
  upsertProductEpc: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/cron-registry", () => ({
  getCronAuthOptionsForPath: vi.fn(() => ({ secretEnvVars: ["CRON_EPC_SECRET"] })),
}));
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: mocks.getPrivilegedSupabaseClient,
}));
vi.mock("@/lib/dal/commissions", () => ({
  upsertProductEpc: mocks.upsertProductEpc,
}));
vi.mock("@/lib/cron-liveness", () => ({
  recordCronLiveness: vi.fn(),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/epc-recompute/route";

type ClickRow = {
  id: string;
  affiliate_url: string;
  created_at: string;
};

function request() {
  return new NextRequest("https://example.com/api/cron/epc-recompute", {
    method: "POST",
  });
}

function supabaseStub(clickPages: ClickRow[][], total: number) {
  let table = "";
  let clickPage = 0;
  let hasCursor = false;
  let exactCountRequests = 0;

  const builder: Record<string, (...args: unknown[]) => unknown> & {
    then?: (
      resolve: (value: { data: unknown[]; error: null; count: number | null }) => unknown,
    ) => Promise<unknown>;
  } = {
    from(name: unknown) {
      table = String(name);
      return builder;
    },
    select(_columns: unknown, options: unknown) {
      if (options && typeof options === "object" && "count" in options) {
        exactCountRequests++;
      }
      return builder;
    },
    unsafeNoSiteFilter() {
      return builder;
    },
    eq() {
      return builder;
    },
    in() {
      return builder;
    },
    gte() {
      return builder;
    },
    or() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    gt() {
      hasCursor = true;
      return builder;
    },
  };

  builder.then = (resolve) => {
    if (table === "product_affiliate_links") {
      return Promise.resolve(
        resolve({
          data: [
            {
              product_id: "product",
              network: "network",
              url: "https://shop.example/products/widget",
              products: { site_id: "site" },
            },
          ],
          error: null,
          count: null,
        }),
      );
    }

    if (table === "affiliate_clicks") {
      const expectedCursor = clickPage > 0;
      if (hasCursor !== expectedCursor) {
        throw new Error(`unexpected keyset cursor state on page ${clickPage}`);
      }
      const data = clickPages[clickPage] ?? [];
      clickPage++;
      hasCursor = false;
      return Promise.resolve(
        resolve({
          data,
          error: null,
          count: clickPage === 1 ? total : null,
        }),
      );
    }

    return Promise.resolve(resolve({ data: [], error: null, count: null }));
  };

  return { builder, getExactCountRequests: () => exactCountRequests };
}

function makeRows(count: number): ClickRow[] {
  const createdAt = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({
    id: index.toString().padStart(6, "0"),
    affiliate_url: `https://shop.example/products/widget?click=${index}`,
    created_at: createdAt,
  }));
}

describe("EPC recompute click pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(true);
    mocks.upsertProductEpc.mockResolvedValue({});
  });

  it("consumes a non-multiple total across keyset pages", async () => {
    const rows = makeRows(2_500);
    const stub = supabaseStub(
      [rows.slice(0, 1_000), rows.slice(1_000, 2_000), rows.slice(2_000)],
      2_500,
    );
    mocks.getPrivilegedSupabaseClient.mockReturnValue(stub.builder);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(stub.getExactCountRequests()).toBe(1);
    expect(mocks.upsertProductEpc).toHaveBeenCalledWith(
      expect.objectContaining({ clicks_30d: 2_500 }),
      expect.any(Function),
    );
  });

  it("continues through short pages caused by a lower server max-rows cap", async () => {
    const rows = makeRows(2_500);
    const pages = Array.from({ length: 7 }, (_, index) =>
      rows.slice(index * 400, (index + 1) * 400),
    );
    const stub = supabaseStub(pages, 2_500);
    mocks.getPrivilegedSupabaseClient.mockReturnValue(stub.builder);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(stub.getExactCountRequests()).toBe(1);
    expect(mocks.upsertProductEpc).toHaveBeenCalledWith(
      expect.objectContaining({ clicks_30d: 2_500 }),
      expect.any(Function),
    );
  });
});
