/**
 * @vitest-environment jsdom
 *
 * Spec: admin-launch-blockers — Phase 1, Task 6.
 *
 * Property 6 (Bug Condition): Static catalogs always render and respect the
 * active site.
 * Validates: Requirements 2.9, 2.10, 2.11
 *   (F-018 / F-019 / F-013, isBugCondition rc4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms the three
 * rc4 defects —
 *
 *   • F-018 (Test Case 6): `platform/modules` renders BLANK below the site
 *     selector (no list, no empty state, no spinner) when
 *     `GET /api/admin/modules` returns non-OK — even though `MODULE_REGISTRY`
 *     is an app-defined static catalog that could always render.
 *   • F-019 (Test Case 7): Integrations renders "No integration providers
 *     available" and Affiliate Networks renders an empty "Available Networks"
 *     table when the DB registry is empty, although both are app-defined
 *     static catalogs that should always render.
 *   • F-013 (Test Case 8): a platform manager with its own "Select Site"
 *     dropdown defaults `selectedSiteId` to `dbSites[0]` (arabic-tools) and
 *     ignores the globally active site.
 *
 * DO NOT change the code to make it pass during Phase 1; the SAME test is
 * re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Cases 6, 7, 8): drive each platform catalog
 * route with the failing precondition (DB registry empty / fetch non-OK / a
 * non-first active site) and assert the EXPECTED (post-fix) behavior:
 *   (TC6) the Modules manager renders the static `MODULE_REGISTRY` (region not
 *         blank) when the per-site modules fetch fails — Requirement 2.9;
 *   (TC7) the Integrations manager does NOT collapse to the bare "No
 *         integration providers available" empty message, and the Affiliate
 *         Networks "Available Networks" catalog always renders rows, when the
 *         registry is empty — Requirement 2.10;
 *   (TC8) a platform manager mounted with a non-first active site defaults its
 *         "Select Site" dropdown to that ACTIVE site rather than `dbSites[0]`
 *         — Requirement 2.11.
 *
 * The components are exercised as-is under jsdom with a mocked `fetch`,
 * mirroring the mocked-fetch + component-render patterns already used by the
 * other admin-launch-blockers explore tests in `__tests__/`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fc from "fast-check";

import { ModulesManager } from "@/app/q7m-k4j9/(dashboard)/platform/modules/modules-manager";
import { IntegrationsManager } from "@/app/q7m-k4j9/(dashboard)/platform/integrations/integrations-manager";
import { AffiliateNetworkManager } from "@/app/q7m-k4j9/(dashboard)/affiliate-networks/affiliate-network-manager";
import type { AvailableNetwork } from "@/app/q7m-k4j9/(dashboard)/affiliate-networks/page";
import { MODULE_REGISTRY } from "@/lib/module-registry";

// React 19 createRoot + act: declare this as an act environment so state
// updates and the chained data-loading effects flush inside act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface SiteRow {
  id: string;
  slug: string;
  name: string;
  db_id: string;
  source: string;
}

/** A minimal OK Response-like object for the components' `fetch(...)` calls. */
function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** A non-OK Response-like object (the DB-unavailable / fetch-failed branch). */
function jsonError(status = 500, body: unknown = { error: "Internal Server Error" }) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

interface FetchScenario {
  sites: SiteRow[];
  /** `{ activeSiteId }` returned by `/api/admin/sites/active`. */
  activeSiteId: string | null;
  /** When false, `/api/admin/modules` answers non-OK (F-018 precondition). */
  modulesOk: boolean;
  /** When false, `/api/admin/integrations` answers an empty registry (F-019). */
  integrationsRegistry: unknown[];
}

/**
 * Install a `fetch` stub for the endpoints the platform managers load on mount.
 * IMPORTANT: `/api/admin/sites/active` MUST be matched before `/api/admin/sites`
 * because the latter is a prefix of the former.
 */
function installFetch(scenario: FetchScenario) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("/api/admin/sites/active")) {
      return jsonOk({ activeSiteId: scenario.activeSiteId });
    }
    if (url.startsWith("/api/admin/sites")) {
      return jsonOk({ sites: scenario.sites });
    }
    if (url.startsWith("/api/admin/modules")) {
      return scenario.modulesOk ? jsonOk({ modules: [] }) : jsonError();
    }
    if (url.startsWith("/api/admin/integrations")) {
      return jsonOk({ integrations: scenario.integrationsRegistry });
    }
    return jsonOk({});
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Flush React effects + the chained awaited fetches/setState several times. */
async function flush(iterations = 8) {
  for (let i = 0; i < iterations; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/**
 * Lightweight flush for synchronous/prop-driven components that don't need
 * async fetch chains. Avoids nested act() calls that cause overlapping-act
 * warnings and can discard renders in React 19's strict act environment.
 */
async function flushSync() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Generators ───────────────────────────────────────────────────────────────

/** The 4 configured tenants; `arabic-tools` is the first/default DB site. */
const TENANT_SLUGS = ["arabic-tools", "crypto-tools", "watch-tools", "gardening-tools"] as const;

function siteRow(slug: string): SiteRow {
  return {
    id: `cfg-${slug}`,
    slug,
    name: slug.replace(/-/g, " "),
    db_id: `db-${slug}`,
    source: "database",
  };
}

/** A DB-managed site list of 2..4 tenants, always with `arabic-tools` first. */
const dbSitesArb: fc.Arbitrary<SiteRow[]> = fc
  .integer({ min: 2, max: TENANT_SLUGS.length })
  .map((n) => TENANT_SLUGS.slice(0, n).map(siteRow));

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

/** Re-mount a fresh root so each property run renders in isolation. */
function freshRoot() {
  act(() => root.unmount());
  container.remove();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
}

describe("admin-launch-blockers Property 6 (F-018): platform/modules renders the static catalog when the modules fetch fails", () => {
  it("EXPECTED-FAIL on unfixed code: the post-selector region renders the seeded MODULE_REGISTRY (it is currently blank)", async () => {
    await fc.assert(
      fc.asyncProperty(dbSitesArb, async (sites) => {
        // F-018 precondition: GET /api/admin/modules returns non-OK, so the
        // per-site merge yields nothing and `grouped` is empty.
        installFetch({
          sites,
          activeSiteId: sites[0]!.db_id,
          modulesOk: false,
          integrationsRegistry: [],
        });

        freshRoot();
        await act(async () => {
          root.render(<ModulesManager />);
        });
        await flush();

        const text = container.textContent ?? "";

        // Expected (post-fix) per Requirement 2.9: the seeded static module
        // catalog renders regardless of the per-site fetch failure (with a
        // proper empty/error state otherwise), so the region is NEVER blank.
        // On the UNFIXED code `modules` stays `[]`, `grouped` is empty, and
        // there is no empty/error state for this branch — so zero registry
        // names appear and this assertion fails.
        const renderedRegistryNames = MODULE_REGISTRY.filter((m) => text.includes(m.name));
        expect(renderedRegistryNames.length).toBeGreaterThan(0);
        // The first registry module ("Blog") is a stable anchor for the catalog.
        expect(text).toContain(MODULE_REGISTRY[0]!.name);
      }),
      { numRuns: 30 },
    );
  }, 30000);

  it("control: the site selector itself still renders (the blank region is below it, not the whole page)", async () => {
    installFetch({
      sites: [siteRow("arabic-tools")],
      activeSiteId: "db-arabic-tools",
      modulesOk: false,
      integrationsRegistry: [],
    });

    await act(async () => {
      root.render(<ModulesManager />);
    });
    await flush();

    // The "Select Site" control renders; the defect is specifically the empty
    // region BELOW it (no module list, no empty state, no spinner).
    expect(container.querySelector("select")).not.toBeNull();
    expect(container.textContent ?? "").toContain("Select Site");
  }, 15000);
});

describe("admin-launch-blockers Property 6 (F-019): static catalogs always render when the registry is empty", () => {
  it("EXPECTED-FAIL on unfixed code: Integrations does not collapse to the bare 'No integration providers available' empty message", async () => {
    await fc.assert(
      fc.asyncProperty(dbSitesArb, async (sites) => {
        // F-019 precondition: the integration_providers registry is empty.
        installFetch({
          sites,
          activeSiteId: sites[0]!.db_id,
          modulesOk: true,
          integrationsRegistry: [],
        });

        freshRoot();
        await act(async () => {
          root.render(<IntegrationsManager />);
        });
        await flush();

        const text = container.textContent ?? "";
        const switches = container.querySelectorAll('[role="switch"]');

        // Expected (post-fix) per Requirement 2.10: the app-defined static
        // integration catalog ALWAYS renders (registered providers with their
        // toggles), so the bare empty message must NOT be the rendered state.
        // On the UNFIXED code the empty registry yields exactly that message
        // and zero provider toggles — so both assertions fail.
        expect(text).not.toContain("No integration providers available");
        expect(switches.length).toBeGreaterThan(0);
      }),
      { numRuns: 30 },
    );
  }, 30000);

  it("EXPECTED-FAIL on unfixed code: Affiliate Networks 'Available Networks' catalog always renders rows when the registry is empty", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        // F-019 precondition: the DB registry is empty, so the page passes an
        // empty `available` catalog to the manager.
        const emptyAvailable: AvailableNetwork[] = [];

        freshRoot();
        await act(async () => {
          root.render(
            <AffiliateNetworkManager
              configured={[]}
              available={emptyAvailable}
              loading={false}
              onRefresh={() => {}}
            />,
          );
        });
        await flushSync();

        // The "Available Networks" reference table is always present; the
        // catalog rows live in its <tbody>.
        const tableBodyRows = container.querySelectorAll("table tbody tr");

        // Expected (post-fix) per Requirement 2.10: the app-defined network
        // catalog renders even when the DB registry is momentarily empty (a
        // static fallback catalog). On the UNFIXED code the manager renders
        // only whatever `available` it is given, so an empty registry yields
        // zero rows and this assertion fails.
        expect(tableBodyRows.length).toBeGreaterThan(0);
      }),
      { numRuns: 5 },
    );
  }, 15000);

  it("control: when the registry is non-empty the Available Networks table renders those rows (display preserved across the fix)", async () => {
    const available: AvailableNetwork[] = [
      {
        network: "cj",
        name: "CJ Affiliate",
        description: "Commission Junction",
        bestFor: "Large brands",
        baseUrl: "https://cj.com",
        requiresApiKey: true,
        envKeyName: "CJ_API_KEY",
      },
    ];

    await act(async () => {
      root.render(
        <AffiliateNetworkManager
          configured={[]}
          available={available}
          loading={false}
          onRefresh={() => {}}
        />,
      );
    });
    await flushSync();

    expect(container.textContent ?? "").toContain("CJ Affiliate");
    expect(container.querySelectorAll("table tbody tr").length).toBeGreaterThan(0);
  }, 15000);
});

describe("admin-launch-blockers Property 6 (F-013): platform manager 'Select Site' dropdown defaults to the active site", () => {
  it("EXPECTED-FAIL on unfixed code: the dropdown defaults to the globally active site, not dbSites[0] (arabic-tools)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 2..4 tenants (arabic-tools first) and a NON-first active index.
        fc.integer({ min: 2, max: TENANT_SLUGS.length }).chain((n) =>
          fc.record({
            sites: fc.constant(TENANT_SLUGS.slice(0, n).map(siteRow)),
            activeIndex: fc.integer({ min: 1, max: n - 1 }),
          }),
        ),
        async ({ sites, activeIndex }) => {
          const activeSite = sites[activeIndex]!;

          installFetch({
            sites,
            activeSiteId: activeSite.db_id,
            modulesOk: true,
            integrationsRegistry: [],
          });

          freshRoot();
          await act(async () => {
            root.render(<ModulesManager />);
          });
          await flush();

          const select = container.querySelector("select") as HTMLSelectElement | null;
          expect(select).not.toBeNull();

          // Expected (post-fix) per Requirement 2.11: the dropdown inherits the
          // globally active site (provided here via /api/admin/sites/active).
          // On the UNFIXED code the manager initialises `selectedSiteId` to
          // `dbSites[0]` (arabic-tools) and never reads the active site, so the
          // selected value is the FIRST site and this assertion fails.
          expect(select!.value).toBe(activeSite.db_id);
          // And specifically NOT the first DB site, since active is non-first.
          expect(select!.value).not.toBe(sites[0]!.db_id);
        },
      ),
      { numRuns: 30 },
    );
  }, 30000);
});
