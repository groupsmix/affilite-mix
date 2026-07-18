/**
 * DAL behaviour for the site_presentations control plane: the public read
 * fails open to null, mapping is lossless, and publish/rollback delegate to the
 * atomic RPCs with the right arguments.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SitePresentationRow } from "@/types/database";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const rpc = vi.fn();
const fakeClient = { from: vi.fn(), rpc: (...a: unknown[]) => rpc(...a) };

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => fakeClient,
}));
vi.mock("@/lib/supabase-server", () => ({ getAnonClient: () => fakeClient }));

const skip = vi.fn(() => false);
vi.mock("@/lib/db-available", () => ({ shouldSkipDbCall: () => skip() }));

import {
  rowToPresentationSource,
  getPublishedPresentationSource,
  publishPresentation,
  rollbackPresentation,
} from "@/lib/dal/site-presentations";

function row(overrides: Partial<SitePresentationRow> = {}): SitePresentationRow {
  return {
    id: "p1",
    site_id: "s1",
    status: "published",
    version: 3,
    header_variant: "magazine",
    footer_variant: "minimal",
    header_config: { showCta: true },
    footer_config: { showNewsletter: false },
    header_tokens: { appearance: "light" },
    created_by: null,
    published_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
  fakeClient.from.mockReset();
  skip.mockReturnValue(false);
});

describe("rowToPresentationSource", () => {
  it("maps a row to the untrusted presentation source", () => {
    const src = rowToPresentationSource(row());
    expect(src).toEqual({
      headerVariant: "magazine",
      footerVariant: "minimal",
      layoutVariant: null,
      headerConfig: { showCta: true },
      footerConfig: { showNewsletter: false },
      headerTokens: { appearance: "light" },
    });
  });
});

describe("getPublishedPresentationSource", () => {
  it("fails open to null when the DB is unavailable", async () => {
    skip.mockReturnValue(true);
    expect(await getPublishedPresentationSource("s-skip")).toBeNull();
  });

  it("returns null when there is no published row", async () => {
    fakeClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    });
    expect(await getPublishedPresentationSource("s-none")).toBeNull();
  });
});

describe("publish/rollback RPCs", () => {
  it("publishPresentation calls the publish RPC with site + actor", async () => {
    rpc.mockResolvedValue({ data: row({ version: 4 }), error: null });
    const out = await publishPresentation("s1", "actor-1");
    expect(rpc).toHaveBeenCalledWith("publish_site_presentation", {
      p_site_id: "s1",
      p_actor: "actor-1",
    });
    expect(out.version).toBe(4);
  });

  it("rollbackPresentation calls the rollback RPC and surfaces errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "no previous presentation" } });
    await expect(rollbackPresentation("s1", null)).rejects.toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("rollback_site_presentation", {
      p_site_id: "s1",
      p_actor: null,
    });
  });
});
