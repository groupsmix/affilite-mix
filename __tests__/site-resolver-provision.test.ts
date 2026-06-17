/**
 * Regression test for the admin dashboard crash where every site-scoped page
 * rendered "Admin Error / An unexpected error occurred".
 *
 * Root cause: resolveDbSiteId() looked the active site up with the tenant
 * client and threw "Site not found in database" whenever the slug had no
 * `sites` row. The admin layout treats static-config sites (config/sites/*) as
 * first-class and lets an admin select one, but those rows are not always
 * seeded (migration 00014 uses `UPDATE ... WHERE slug = …`, a no-op on a fresh
 * DB; `ai-compared` is only seeded by a separate script). The resolver now
 * reads with the privileged client (like requireAdmin) and auto-provisions the
 * row from static config, so the dashboard works for any valid, selected site.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SiteRow } from "@/types/database";

const mocks = vi.hoisted(() => ({
  getSiteRowBySlugWithClient: vi.fn(),
  upsertConfigSite: vi.fn(),
  getSiteById: vi.fn(),
  toSiteRow: vi.fn(),
  shouldSkipDbCall: vi.fn(),
  getPrivilegedSupabaseClient: vi.fn(() => ({})),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowBySlugWithClient: mocks.getSiteRowBySlugWithClient,
  upsertConfigSite: mocks.upsertConfigSite,
}));
vi.mock("@/config/sites", () => ({
  getSiteById: mocks.getSiteById,
  toSiteRow: mocks.toSiteRow,
}));
vi.mock("@/lib/db-available", () => ({
  shouldSkipDbCall: mocks.shouldSkipDbCall,
}));
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: mocks.getPrivilegedSupabaseClient,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

const dbRow = { id: "db-uuid-existing", slug: "crypto-tools" } as unknown as SiteRow;
const provisionedRow = { id: "db-uuid-provisioned", slug: "crypto-tools" } as unknown as SiteRow;

async function importResolver() {
  return import("@/lib/dal/site-resolver");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.shouldSkipDbCall.mockReturnValue(false);
  mocks.getSiteRowBySlugWithClient.mockResolvedValue(null);
  mocks.getSiteById.mockReturnValue(undefined);
  mocks.toSiteRow.mockReturnValue({ slug: "crypto-tools" });
  mocks.upsertConfigSite.mockResolvedValue(provisionedRow);
});

describe("site-resolver auto-provisioning", () => {
  it("returns the existing DB row without provisioning", async () => {
    mocks.getSiteRowBySlugWithClient.mockResolvedValueOnce(dbRow);
    const { resolveDbSiteId } = await importResolver();
    await expect(resolveDbSiteId("crypto-tools")).resolves.toBe("db-uuid-existing");
    expect(mocks.upsertConfigSite).not.toHaveBeenCalled();
  });

  it("provisions a known static-config site that has no DB row yet", async () => {
    mocks.getSiteById.mockReturnValue({ id: "crypto-tools" });
    const { resolveDbSiteId } = await importResolver();
    await expect(resolveDbSiteId("crypto-tools")).resolves.toBe("db-uuid-provisioned");
    expect(mocks.upsertConfigSite).toHaveBeenCalledTimes(1);
  });

  it("resolves the active site with the privileged (service-role) client", async () => {
    mocks.getSiteRowBySlugWithClient.mockResolvedValueOnce(dbRow);
    const { resolveDbSiteBySlug } = await importResolver();
    await resolveDbSiteBySlug("crypto-tools");
    const clientGetter = mocks.getSiteRowBySlugWithClient.mock.calls[0]![1] as () => unknown;
    clientGetter();
    expect(mocks.getPrivilegedSupabaseClient).toHaveBeenCalled();
  });

  it("throws for an unknown slug that is not a static-config site", async () => {
    const { resolveDbSiteId } = await importResolver();
    await expect(resolveDbSiteId("ghost-site")).rejects.toThrow(/Site not found/);
    expect(mocks.upsertConfigSite).not.toHaveBeenCalled();
  });

  it("returns null (no crash) from resolveDbSiteBySlug for an unknown slug", async () => {
    const { resolveDbSiteBySlug } = await importResolver();
    await expect(resolveDbSiteBySlug("ghost-site")).resolves.toBeNull();
    // resolveDbSiteBySlug is read-only — must never provision
    expect(mocks.upsertConfigSite).not.toHaveBeenCalled();
  });

  it("resolveDbSiteBySlug never provisions even for a known static-config site", async () => {
    // DB returns null (site not seeded yet)
    mocks.getSiteRowBySlugWithClient.mockResolvedValueOnce(null);
    mocks.getSiteById.mockReturnValue({ id: "crypto-tools" });
    const { resolveDbSiteBySlug } = await importResolver();
    // Should return null gracefully — NOT provision
    await expect(resolveDbSiteBySlug("crypto-tools")).resolves.toBeNull();
    expect(mocks.upsertConfigSite).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent-provision unique conflict by re-reading", async () => {
    mocks.getSiteById.mockReturnValue({ id: "crypto-tools" });
    mocks.getSiteRowBySlugWithClient
      .mockResolvedValueOnce(null) // initial lookup: not there yet
      .mockResolvedValueOnce(dbRow); // re-read after the write conflict
    mocks.upsertConfigSite.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    );
    const { resolveDbSiteId } = await importResolver();
    await expect(resolveDbSiteId("crypto-tools")).resolves.toBe("db-uuid-existing");
  });

  it("does not touch the DB when Supabase is not configured", async () => {
    mocks.shouldSkipDbCall.mockReturnValue(true);
    const { resolveDbSiteBySlug } = await importResolver();
    await expect(resolveDbSiteBySlug("crypto-tools")).resolves.toBeNull();
    expect(mocks.getSiteRowBySlugWithClient).not.toHaveBeenCalled();
  });
});
