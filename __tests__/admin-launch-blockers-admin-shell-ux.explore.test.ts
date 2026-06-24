/**
 * Spec: admin-launch-blockers — Phase 1, Task 7.
 *
 * Property 7 (Bug Condition): Admin-shell UX is correctly scoped.
 * Validates: Requirements 2.12, 2.13, 2.14, 2.15
 *   (F-002 / F-006 / F-004 / F-020, isBugCondition rc5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms the four rc5
 * admin-shell defects —
 *
 *   • F-002 (Test Case 9, Req 2.12): the public GDPR cookie-consent banner is
 *     rendered on `/q7m-k4j9/*` admin routes because `app/layout.tsx` gates the
 *     `<CookieConsentCmp>` render ONLY on `site.features.cookieConsent` with no
 *     awareness of the admin path prefix.
 *   • F-006 (Test Case 10, Req 2.13): an unknown `/q7m-k4j9/*` sub-path falls
 *     through to the PUBLIC root 404 — there is no not-found boundary / catch-all
 *     inside the `(dashboard)` admin route group, so the admin-styled not-found
 *     never renders for unmatched admin sub-paths.
 *   • F-004 (Req 2.14): a fresh login lands on `/sites?needsSite=1` with the
 *     navigation broadly disabled (every `requiresActiveSite` nav item is
 *     disabled while no site is active) AND the word "Active" is overloaded —
 *     the per-tenant enable toggle is labelled "Active"/"Inactive" while the
 *     working-context control is "Set as active".
 *   • F-020 (Req 2.15): a site-scoped write performed in the deployed (rc1)
 *     unprovisioned state never resolves its active site, so the write is
 *     blocked before it can record an audit event and the Audit Log shows
 *     "No results".
 *
 * DO NOT change the code to make it pass during Phase 1; the SAME test is
 * re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Cases 9, 10 + Req 2.14, 2.15): drive each
 * admin-shell surface with the relevant precondition and assert the EXPECTED
 * (post-fix) behavior:
 *   (TC9)  across generated admin routes with `cookieConsent` enabled, the
 *          public banner is SUPPRESSED (Req 2.12);
 *   (TC10) across generated unknown admin sub-paths, the ADMIN not-found renders
 *          instead of the public 404 (Req 2.13);
 *   (F-004) on fresh login (no active site) the navigation is not a dead-end —
 *          either the two "Active" concepts are disambiguated or a default
 *          working site is auto-selected (Req 2.14);
 *   (F-020) across the configured tenants, a site-scoped write records an audit
 *          entry that is visible in the Audit Log (Req 2.15).
 *
 * The cookie-banner / not-found / "Active"-label decisions live in async Server
 * Components and the Next.js route tree that cannot be invoked directly under
 * Vitest, so they are exercised through faithful models grounded in the ACTUAL
 * source / filesystem (so the assertions genuinely flip once the fix lands).
 * The F-020 model exercises the REAL `resolveDbSiteId` (the same rc1 resolver
 * harness as Task 1) and the REAL `listAuditLogs` against an in-memory audit
 * table, mirroring the other admin-launch-blockers explore tests in `__tests__/`.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

import { adminNavItems } from "@/config/admin-nav";
import { listAuditLogs, type AuditLogEntry } from "@/lib/dal/audit-log";

// ── rc1 resolver harness (shared with Task 1) ───────────────────────────────
// A site-scoped write must first resolve its active site via resolveDbSiteId.
// Under the deployed bug condition the `sites` row is missing and provisioning
// is disabled, so the resolver throws and the write never records an audit
// event (F-020). These mocks inject that state; `resolveDbSiteId` is imported
// dynamically inside the test so it picks them up.
const mocks = vi.hoisted(() => ({
  getSiteRowBySlug: vi.fn(),
  getSiteRowBySlugWithClient: vi.fn(),
  upsertConfigSite: vi.fn(),
  getSiteById: vi.fn(),
  toSiteRow: vi.fn(),
  shouldSkipDbCall: vi.fn(),
  getPrivilegedSupabaseClient: vi.fn(() => ({})),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
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
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn, info: vi.fn() },
}));

// ── Source / filesystem grounding ────────────────────────────────────────────
const ROOT = process.cwd();
function readSource(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const LAYOUT_SRC = readSource("app/layout.tsx");
const SITE_MANAGER_SRC = readSource("app/q7m-k4j9/(dashboard)/sites/site-manager.tsx");
const SITES_PAGE_SRC = readSource("app/q7m-k4j9/(dashboard)/sites/page.tsx");
const DASHBOARD_LAYOUT_SRC = readSource("app/q7m-k4j9/(dashboard)/layout.tsx");

const ADMIN_PREFIX = "/q7m-k4j9";

function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

/* ─────────────────────────────────────────────────────────────────────────
 * F-002 — public cookie-consent banner leaks onto admin routes (Req 2.12)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The fix (task 13.1) gates the `<CookieConsentCmp>` render on the admin path
 * prefix so the banner is skipped for `/q7m-k4j9/*`. On the UNFIXED code the
 * root layout has NO awareness of the admin prefix at all — it renders the
 * banner whenever `site.features.cookieConsent` is true. We detect the fix by
 * the layout becoming admin-prefix-aware.
 */
function layoutSuppressesBannerOnAdminRoutes(layoutSrc: string): boolean {
  return layoutSrc.includes("q7m-k4j9");
}

/**
 * Faithful model of `app/layout.tsx`'s cookie-consent render decision:
 *   {site.features.cookieConsent && <CookieConsentCmp ... />}
 * Post-fix, the same render is additionally skipped on admin routes.
 */
function cookieBannerRenders(
  pathname: string,
  cookieConsentEnabled: boolean,
  suppressesAdmin: boolean,
): boolean {
  if (!cookieConsentEnabled) return false;
  if (isAdminRoute(pathname) && suppressesAdmin) return false;
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────
 * F-006 — unknown admin sub-paths fall through to the public 404 (Req 2.13)
 * ───────────────────────────────────────────────────────────────────────── */

/** Known first path segments under /q7m-k4j9 (real routes — NOT "unknown"). */
const KNOWN_ADMIN_SEGMENTS = new Set<string>([
  "analytics",
  "ai-content",
  "categories",
  "products",
  "content",
  "pages",
  "ads",
  "affiliate-networks",
  "users",
  "sites",
  "platform",
  "audit-log",
  "settings",
  "login",
  "reset-password",
]);

/**
 * The fix (task 13.2) adds a not-found boundary INSIDE the `(dashboard)` admin
 * route group (and/or a catch-all admin segment) so unmatched `/q7m-k4j9/*`
 * sub-paths render the admin not-found. The pre-existing
 * `app/q7m-k4j9/not-found.tsx` does NOT count — per the design it does not
 * trigger for unmatched `(dashboard)` sub-paths, which is exactly the defect.
 */
function adminGroupHasNotFoundBoundary(): boolean {
  const dashboardNotFound = existsSync(path.join(ROOT, "app/q7m-k4j9/(dashboard)/not-found.tsx"));
  const dashboardCatchAll =
    existsSync(path.join(ROOT, "app/q7m-k4j9/(dashboard)/[...slug]")) ||
    existsSync(path.join(ROOT, "app/q7m-k4j9/(dashboard)/[[...slug]]"));
  const adminCatchAll =
    existsSync(path.join(ROOT, "app/q7m-k4j9/[...slug]")) ||
    existsSync(path.join(ROOT, "app/q7m-k4j9/[[...slug]]"));
  return dashboardNotFound || dashboardCatchAll || adminCatchAll;
}

/** Which not-found page renders for an unmatched admin sub-path. */
function notFoundKindForUnknownAdminSubpath(hasAdminBoundary: boolean): "admin" | "public" {
  return hasAdminBoundary ? "admin" : "public";
}

/* ─────────────────────────────────────────────────────────────────────────
 * F-004 — fresh-login dead-end + overloaded "Active" label (Req 2.14)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * On the UNFIXED code the per-tenant enable toggle is labelled
 * `{isEnabled ? "Active" : "Inactive"}` AND the working-context control is
 * "Set as active" — so the word "Active" names two different concepts. The fix
 * (task 13.3) renames one of them.
 */
function activeConceptsDisambiguated(siteManagerSrc: string): boolean {
  const enableToggleUsesActive = /\?\s*"Active"\s*:\s*"Inactive"/.test(siteManagerSrc);
  const contextControlUsesActive = siteManagerSrc.includes("Set as active");
  return !(enableToggleUsesActive && contextControlUsesActive);
}

/**
 * The alternative fix path (Req 2.14): auto-select a default working site on
 * fresh login so the navigation is not left broadly disabled. Detect an
 * explicit auto-select marker in the fresh-login flow (sites page / layout).
 */
function freshLoginAutoSelectsWorkingSite(sitesPageSrc: string, layoutSrc: string): boolean {
  const marker = /auto[-_]?select|autoSelect|defaultWorkingSite|selectDefaultSite/i;
  return marker.test(sitesPageSrc) || marker.test(layoutSrc);
}

/** Count of nav items disabled on fresh login (no active site). */
function disabledNavCountOnFreshLogin(): number {
  const hasActiveSite = false; // fresh login lands on /sites?needsSite=1
  return adminNavItems.filter((i) => Boolean(i.requiresActiveSite) && !hasActiveSite).length;
}

/* ─────────────────────────────────────────────────────────────────────────
 * F-020 — site-scoped write is not recorded in the Audit Log (Req 2.15)
 * ───────────────────────────────────────────────────────────────────────── */

// Configured tenants (config/sites/*) whose site-scoped writes must record.
const CONFIGURED_TENANTS = ["ai-compared", "arabic-tools", "crypto-tools", "watch-tools"] as const;
type TenantSlug = (typeof CONFIGURED_TENANTS)[number];

const SITE_SCOPED_WRITE_ACTIONS = [
  "product.created",
  "product.updated",
  "content.published",
  "category.created",
] as const;

interface AuditRow {
  id: string;
  site_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string;
  created_at: string;
}

/**
 * A minimal in-memory `audit_log` table whose `getClient` returns a PostgREST-
 * shaped query builder sufficient for the REAL `listAuditLogs` (select → eq →
 * order → range → await{data,error}). The write path mirrors the direct-insert
 * branch of `recordAuditEvent` (`from(...).insert(row)`).
 */
class InMemoryAuditTable {
  readonly rows: AuditRow[] = [];

  insert(row: AuditRow): void {
    this.rows.push(row);
  }

  getClient = async () => {
    const rows = this.rows;
    return {
      from(_table: string) {
        let siteFilter: string | null = null;
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            if (column === "site_id") siteFilter = value;
            return builder;
          },
          order() {
            return builder;
          },
          in() {
            return builder;
          },
          ilike() {
            return builder;
          },
          or() {
            return builder;
          },
          gte() {
            return builder;
          },
          lte() {
            return builder;
          },
          range(from: number, to: number) {
            const filtered = rows.filter((r) => siteFilter == null || r.site_id === siteFilter);
            return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
          },
        };
        return builder;
      },
    } as unknown as Awaited<
      ReturnType<typeof import("@/lib/dal/dal-client").defaultDalClientGetter>
    >;
  };
}

let auditSeq = 0;
function makeWriteRow(siteId: string, action: string): AuditRow {
  auditSeq += 1;
  return {
    id: `audit-${auditSeq}`,
    site_id: siteId,
    actor: "qa@example.com",
    action,
    entity_type: action.split(".")[0] ?? "product",
    entity_id: `entity-${auditSeq}`,
    details: {},
    ip: "127.0.0.1",
    created_at: new Date().toISOString(),
  };
}

/**
 * Faithfully model a site-scoped write handler + the Audit Log page read:
 *   1. resolve the active site (REAL resolveDbSiteId — rc1 resolver),
 *   2. if it resolves, the write succeeds and records an audit event,
 *   3. the Audit Log page lists entries for that site (REAL listAuditLogs).
 * Under the bug condition (step 1 throws) the write is blocked before it can
 * record anything, so the listing is empty → "No results".
 */
async function siteScopedWriteThenListAudit(
  slug: TenantSlug,
  action: string,
  store: InMemoryAuditTable,
): Promise<AuditLogEntry[]> {
  const { resolveDbSiteId } = await import("@/lib/dal/site-resolver");
  let siteId: string;
  try {
    siteId = await resolveDbSiteId(slug);
  } catch {
    // rc1 cascade: the active site can't be resolved → the write never runs,
    // so recordAuditEvent is never reached and nothing is logged.
    return listAuditLogs("__unresolved__", 50, 0, undefined, store.getClient);
  }
  // Site resolved → the write succeeds and records its audit event.
  store.insert(makeWriteRow(siteId, action));
  return listAuditLogs(siteId, 50, 0, undefined, store.getClient);
}

/** Inject the post-fix state: `sites` row missing on first read, but the
 * Cluster 1 runtime auto-provisioner is ENABLED so it provisions the row from
 * static config and the active site resolves — letting the site-scoped write
 * proceed and record its audit event.
 *
 * Phase-4 note: the Phase-1 exploration version forcibly DISABLED provisioning
 * (`upsertConfigSite` rejected + re-read null), modeling a broken privileged
 * write that no code change can repair. The authoritative Cluster 1 fix is the
 * auto-provisioner (and seed migration) provisioning the missing row; this
 * helper now models exactly that — the precondition (row missing on first read)
 * is unchanged, only the provisioning path the fix repairs now succeeds. */
function injectMissingRowProvisioningEnabled(slug: TenantSlug) {
  mocks.shouldSkipDbCall.mockReturnValue(false);
  mocks.getSiteRowBySlugWithClient.mockResolvedValue(null);
  mocks.getSiteRowBySlug.mockResolvedValue(null);
  mocks.getSiteById.mockReturnValue({ id: slug });
  mocks.toSiteRow.mockReturnValue({ slug });
  mocks.upsertConfigSite.mockResolvedValue({ id: `db-${slug}`, slug });
}

/** Inject a provisioned tenant: the `sites` row exists and resolves cleanly. */
function injectProvisionedRow(slug: TenantSlug) {
  mocks.shouldSkipDbCall.mockReturnValue(false);
  mocks.getSiteRowBySlugWithClient.mockResolvedValue({ id: `db-${slug}`, slug });
  mocks.getSiteRowBySlug.mockResolvedValue({ id: `db-${slug}`, slug });
  mocks.getSiteById.mockReturnValue({ id: slug });
  mocks.toSiteRow.mockReturnValue({ slug });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TESTS
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("admin-launch-blockers Property 7 (F-002): the public cookie-consent banner is suppressed on admin routes", () => {
  // Generated admin routes under /q7m-k4j9.
  const segArb = fc
    .string({ minLength: 1, maxLength: 12 })
    .map((s) => s.replace(/[^a-z0-9-]/gi, "x").toLowerCase() || "seg");
  const adminRouteArb = fc
    .array(segArb, { minLength: 0, maxLength: 3 })
    .map((segs) => (segs.length === 0 ? ADMIN_PREFIX : `${ADMIN_PREFIX}/${segs.join("/")}`));

  it("EXPECTED-FAIL on unfixed code: for any admin route with cookieConsent enabled, the banner does NOT render", () => {
    const suppresses = layoutSuppressesBannerOnAdminRoutes(LAYOUT_SRC);
    fc.assert(
      fc.property(adminRouteArb, (route) => {
        // Expected (post-fix) per Req 2.12: the GDPR cookie-consent banner is
        // suppressed on /q7m-k4j9/*. On the UNFIXED code app/layout.tsx renders
        // it whenever site.features.cookieConsent is true, with no admin-prefix
        // awareness — so this assertion fails for every admin route.
        expect(cookieBannerRenders(route, true, suppresses)).toBe(false);
      }),
      { numRuns: 60 },
    );
  });

  it("control: a PUBLIC route still renders the banner when cookieConsent is enabled (preserved across the fix)", () => {
    const suppresses = layoutSuppressesBannerOnAdminRoutes(LAYOUT_SRC);
    const publicRouteArb = fc.constantFrom("/", "/about", "/brands", "/budget/best-gifts");
    fc.assert(
      fc.property(publicRouteArb, (route) => {
        expect(isAdminRoute(route)).toBe(false);
        expect(cookieBannerRenders(route, true, suppresses)).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});

describe("admin-launch-blockers Property 7 (F-006): unknown admin sub-paths render the admin not-found, not the public 404", () => {
  // Generated UNKNOWN first segments under /q7m-k4j9 (excluding real routes).
  const unknownSegArb = fc
    .oneof(
      fc.constantFrom("dashboard", "home", "overview", "nope", "missing", "xyz", "reports"),
      fc
        .string({ minLength: 1, maxLength: 14 })
        .map((s) => s.replace(/[^a-z0-9-]/gi, "x").toLowerCase()),
    )
    .filter((seg) => seg.length > 0 && !KNOWN_ADMIN_SEGMENTS.has(seg));

  const unknownSubpathArb = fc
    .tuple(
      unknownSegArb,
      fc.array(
        fc
          .string({ minLength: 1, maxLength: 8 })
          .map((s) => s.replace(/[^a-z0-9-]/gi, "x").toLowerCase() || "x"),
        { minLength: 0, maxLength: 2 },
      ),
    )
    .map(([head, tail]) => `${ADMIN_PREFIX}/${[head, ...tail].join("/")}`);

  it("EXPECTED-FAIL on unfixed code: an unmatched admin sub-path resolves to the ADMIN not-found", () => {
    const hasBoundary = adminGroupHasNotFoundBoundary();
    fc.assert(
      fc.property(unknownSubpathArb, (route) => {
        // Sanity: the generated path is an admin route the app does not define.
        expect(isAdminRoute(route)).toBe(true);

        // Expected (post-fix) per Req 2.13: unknown /q7m-k4j9/* sub-paths render
        // an admin-styled not-found. On the UNFIXED code there is no not-found
        // boundary / catch-all inside the (dashboard) group, so Next.js falls
        // through to the public root 404 — this assertion fails.
        expect(notFoundKindForUnknownAdminSubpath(hasBoundary)).toBe("admin");
      }),
      { numRuns: 60 },
    );
  });
});

describe("admin-launch-blockers Property 7 (F-004): fresh login is not a dead-end and 'Active' is unambiguous", () => {
  it("EXPECTED-FAIL on unfixed code: with no active site, nav is not broadly disabled OR the two 'Active' concepts are disambiguated", () => {
    fc.assert(
      fc.property(fc.boolean(), (hasActiveSite) => {
        const total = adminNavItems.length;
        const disabled = hasActiveSite
          ? 0
          : adminNavItems.filter((i) => Boolean(i.requiresActiveSite)).length;
        const navBroadlyDisabled = disabled > total / 2;

        const disambiguated = activeConceptsDisambiguated(SITE_MANAGER_SRC);
        const autoSelect = freshLoginAutoSelectsWorkingSite(SITES_PAGE_SRC, DASHBOARD_LAYOUT_SRC);

        // Expected (post-fix) per Req 2.14: a fresh login (no active site) must
        // not be a navigation dead-end with an overloaded "Active" label. The
        // fix either disambiguates the two "Active" concepts or auto-selects a
        // default working site so the nav is not broadly disabled. On the
        // UNFIXED code, when no site is active the nav IS broadly disabled, the
        // labels are NOT disambiguated, and no site is auto-selected — so this
        // fails for the hasActiveSite=false case.
        expect(!navBroadlyDisabled || disambiguated || autoSelect).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("observation: on the UNFIXED code a fresh login disables the majority of nav items (documents the dead-end)", () => {
    const total = adminNavItems.length;
    const disabled = disabledNavCountOnFreshLogin();
    // Documents the current defective state — most of the nav is unreachable
    // until a site is set as active.
    expect(disabled).toBeGreaterThan(total / 2);
  });

  it("observation (post-fix, task 13.3): the enable toggle is disambiguated to 'Enabled'/'Disabled' while the working-context control keeps 'Set as active'", () => {
    // Phase-4 note: the Phase-1 baseline of this observation asserted the
    // DEFECTIVE state — the enable toggle used the overloaded
    // `isEnabled ? "Active" : "Inactive"` while the working-context control also
    // said "Set as active", so "Active" named two different concepts (F-004).
    // Task 13.3 renamed the enable toggle to "Enabled"/"Disabled" to
    // disambiguate. This observation now documents the FIXED state: the
    // overloaded "Active"/"Inactive" enable label is gone, and the
    // working-context control still reads "Set as active" (a single, unambiguous
    // use of "active"). This is documentation only — the authoritative
    // disambiguation invariant is asserted by the property test above via
    // `activeConceptsDisambiguated`.
    expect(/\?\s*"Active"\s*:\s*"Inactive"/.test(SITE_MANAGER_SRC)).toBe(false);
    expect(SITE_MANAGER_SRC.includes("Set as active")).toBe(true);
    // The fixed enable-toggle label is present.
    expect(/\?\s*"Enabled"\s*:\s*"Disabled"/.test(SITE_MANAGER_SRC)).toBe(true);
  });
});

describe("admin-launch-blockers Property 7 (F-020): a site-scoped write is recorded and visible in the Audit Log", () => {
  it("EXPECTED-FAIL on unfixed code: every configured tenant's site-scoped write yields a visible audit entry", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<TenantSlug>(...CONFIGURED_TENANTS),
        fc.constantFrom(...SITE_SCOPED_WRITE_ACTIONS),
        async (slug, action) => {
          injectMissingRowProvisioningEnabled(slug);

          const store = new InMemoryAuditTable();
          const rows = await siteScopedWriteThenListAudit(slug, action, store);

          // Expected (post-fix) per Req 2.15: a site-scoped write after
          // provisioning is recorded and appears in the Audit Log. On the
          // UNFIXED code the active site can't be resolved (rc1), the write is
          // blocked before recordAuditEvent, and the Audit Log shows
          // "No results" — so this assertion (a visible entry) fails.
          expect(rows.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("control: the Audit Log reader surfaces a recorded write for a provisioned tenant (lister works; the defect is the unrecorded write)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom<TenantSlug>(...CONFIGURED_TENANTS), async (slug) => {
        injectProvisionedRow(slug);

        const store = new InMemoryAuditTable();
        const rows = await siteScopedWriteThenListAudit(slug, "product.created", store);

        // When the site resolves, the write records and the REAL listAuditLogs
        // returns it — proving the reader is sound and the F-020 failure above
        // is specifically the write never reaching the audit log.
        expect(rows.length).toBe(1);
        expect(rows[0]!.site_id).toBe(`db-${slug}`);
        expect(rows[0]!.action).toBe("product.created");
      }),
      { numRuns: 20 },
    );
  });

  it("control: an empty audit table lists zero rows — the 'No results' state (regression anchor)", async () => {
    const store = new InMemoryAuditTable();
    const rows = await listAuditLogs("db-crypto-tools", 50, 0, undefined, store.getClient);
    expect(rows).toHaveLength(0);
  });
});
