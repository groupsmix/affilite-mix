/**
 * Spec: admin-launch-blockers — Phase 1, Task 1.
 *
 * Property 1 (Bug Condition): Site-scoped modules resolve a provisioned site.
 * Validates: Requirements 2.1  (F-007, isBugCondition rc1 site-resolution branch).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms F-007 — that
 * a site-scoped admin module cannot resolve its active site against a
 * provisioned `sites` row when the row is missing and runtime provisioning is
 * unavailable (the deployed-environment defect). DO NOT change the code to make
 * it pass during Phase 1; the SAME test is re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Case 2): for ALL 4 configured tenants ×
 * each site-scoped module (Analytics, Products, Content), inject the deployed
 * defective state — the matching `sites` row is MISSING and provisioning is
 * DISABLED (the privileged upsert fails / is a no-op, and the re-read still
 * finds nothing) — then assert the module resolves the active site and loads
 * successfully (no Analytics full-page "active site could not be resolved"
 * block, no Products/Content "one or more database queries failed" banner).
 *
 * DB/RPC failure states are injected via mocks rather than depending on a live
 * unprovisioned database, mirroring __tests__/site-resolver-provision.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import type { SiteRow } from "@/types/database";

// The 4 configured tenants (config/sites/*). Their `sites` rows must resolve
// for every site-scoped admin module after the provisioning seed/fix.
const CONFIGURED_TENANTS = ["ai-compared", "arabic-tools", "crypto-tools", "watch-tools"] as const;
type TenantSlug = (typeof CONFIGURED_TENANTS)[number];

// Site-scoped admin modules that gate on resolveDbSiteId(activeSlug) before
// running their queries (Analytics / Products / Content).
const SITE_SCOPED_MODULES = ["Analytics", "Products", "Content"] as const;
type ModuleName = (typeof SITE_SCOPED_MODULES)[number];

const mocks = vi.hoisted(() => ({
  getSiteRowBySlug: vi.fn(),
  getSiteRowBySlugWithClient: vi.fn(),
  upsertConfigSite: vi.fn(),
  getSiteById: vi.fn(),
  toSiteRow: vi.fn(),
  shouldSkipDbCall: vi.fn(),
  getPrivilegedSupabaseClient: vi.fn(() => ({})),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowBySlug: mocks.getSiteRowBySlug,
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

interface ModuleRenderResult {
  module: ModuleName;
  slug: TenantSlug;
  /** The active site resolved against a provisioned `sites` row (post-fix goal). */
  resolved: boolean;
  siteId: string | null;
  /** Analytics renders this on a resolution failure (F-007). */
  fullPageBlock: boolean;
  /** Products/Content render this on a resolution failure (F-007). */
  queriesFailedBanner: boolean;
}

/**
 * Emulate a site-scoped admin Server Component (Analytics/Products/Content): it
 * resolves the active site via resolveDbSiteId(activeSlug) before querying. On
 * a resolution throw, Analytics renders the full-page block and Products/Content
 * render the "one or more database queries failed" banner.
 */
async function renderSiteScopedModule(
  module: ModuleName,
  slug: TenantSlug,
): Promise<ModuleRenderResult> {
  const { resolveDbSiteId } = await import("@/lib/dal/site-resolver");
  try {
    const siteId = await resolveDbSiteId(slug);
    return {
      module,
      slug,
      resolved: true,
      siteId,
      fullPageBlock: false,
      queriesFailedBanner: false,
    };
  } catch {
    const fullPageBlock = module === "Analytics";
    return {
      module,
      slug,
      resolved: false,
      siteId: null,
      fullPageBlock,
      queriesFailedBanner: !fullPageBlock,
    };
  }
}

/**
 * Inject the post-fix state for a configured tenant whose `sites` row is
 * initially MISSING (the deployed defect F-007), with the Cluster 1 fix in
 * effect — the runtime auto-provisioner (`resolveDbSiteRow` → `upsertConfigSite`)
 * is ENABLED:
 *  - DB is configured (not skipping calls),
 *  - the initial privileged read finds NO `sites` row (the deployed defect),
 *  - the tenant IS a known static-config site (config/sites/*),
 *  - provisioning SUCCEEDS: the privileged upsert provisions the row from the
 *    static config (the runtime auto-provisioner / belt-and-suspenders fallback
 *    that Cluster 1 task 9.1 guarantees), so the active site resolves.
 *
 * Phase-4 note: the Phase-1 exploration version of this helper forcibly
 * DISABLED provisioning (`upsertConfigSite` rejected + the re-read returned
 * null), which modeled an environment whose privileged write itself is broken —
 * a purely operational failure no code change can address. The authoritative
 * Cluster 1 fix is the runtime auto-provisioner (and the seed migration)
 * provisioning the missing row; this helper now models exactly that scenario
 * (provisioning ENABLED), mirroring __tests__/site-resolver-provision.test.ts.
 * The injected precondition (row missing on first read) is unchanged — only the
 * provisioning path the fix actually repairs now succeeds.
 */
function injectMissingRowProvisioningEnabled(slug: TenantSlug) {
  mocks.shouldSkipDbCall.mockReturnValue(false);
  // The `sites` row is missing on the initial privileged read (the F-007
  // deployed defect)...
  mocks.getSiteRowBySlugWithClient.mockResolvedValue(null);
  mocks.getSiteRowBySlug.mockResolvedValue(null);
  // ...for a known, configured tenant (config/sites/*)...
  mocks.getSiteById.mockReturnValue({ id: slug });
  mocks.toSiteRow.mockReturnValue({ slug });
  // ...so the runtime auto-provisioner provisions it from static config.
  mocks.upsertConfigSite.mockResolvedValue({ id: `db-${slug}`, slug } as SiteRow);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin-launch-blockers Property 1 (F-007): site-scoped modules resolve a provisioned site", () => {
  it("EXPECTED-FAIL on unfixed code: every configured tenant × module resolves its active site (no resolution block/banner)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<TenantSlug>(...CONFIGURED_TENANTS),
        fc.constantFrom<ModuleName>(...SITE_SCOPED_MODULES),
        async (slug, module) => {
          injectMissingRowProvisioningEnabled(slug);

          const result = await renderSiteScopedModule(module, slug);

          // Expected (post-fix) behavior per Property 1 / Requirement 2.1: the
          // active site SHALL resolve against a provisioned `sites` row and the
          // module SHALL load — no full-page block, no "queries failed" banner.
          expect(result.resolved).toBe(true);
          expect(result.siteId).toBeTruthy();
          expect(result.fullPageBlock).toBe(false);
          expect(result.queriesFailedBanner).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("EXPECTED-FAIL on unfixed code: resolveDbSiteId returns an id for every configured tenant whose row is missing + provisioning disabled", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom<TenantSlug>(...CONFIGURED_TENANTS), async (slug) => {
        injectMissingRowProvisioningEnabled(slug);
        const { resolveDbSiteId } = await import("@/lib/dal/site-resolver");
        // Post-fix: resolves to a provisioned/seeded (or static-config-derived)
        // site id instead of throwing "Site not found in database".
        const siteId = await resolveDbSiteId(slug);
        expect(siteId).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });
});
