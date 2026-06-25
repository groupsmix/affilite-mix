/**
 * @vitest-environment jsdom
 *
 * Task 2.6 — Bug 6 preservation tests (PHASE 2, run on UNFIXED code).
 *
 * BUG CONTEXT:
 * `TenantBadgeSwitcher.handleSelect` silently swallows non-OK HTTP responses
 * (no `else` branch after `if (res.ok)`). The component also uses unsafe `as`
 * casts for API response shapes. The fix (tasks 8.1–8.4) will add:
 *   - Zod schemas for API responses
 *   - `switchError` state + else branch in `handleSelect`
 *   - Rendering of `switchError` inside the popover
 *
 * GOAL: Capture the CURRENT happy-path behaviors so they survive the fix.
 * All three tests below PASS on UNFIXED code and must continue to PASS after
 * the fix is applied.
 *
 * OBSERVATION LOG (from reading the unfixed component):
 *
 *   Observation 1 — Successful site switch:
 *     When `fetchWithCsrf` resolves to `{ ok: true }`:
 *       - `setActiveSiteId(siteId)` is called (clicked site becomes active)
 *       - `setOpen(false)` is called (popover closes)
 *       - `router.refresh()` is called
 *     Evidence: handleSelect():
 *       if (res.ok) { setActiveSiteId(siteId); setOpen(false); router.refresh(); }
 *
 *   Observation 2 — Loading skeleton:
 *     When `sites === null && !loadError` (first open, before fetch resolves):
 *       - Three skeleton placeholder elements with `animate-pulse` class render
 *     Evidence: JSX block:
 *       {sites === null && !loadError && (
 *         <div className="space-y-2 p-3">
 *           {[0, 1, 2].map((i) => ( <div key={i} className="... animate-pulse ..." /> ))}
 *         </div>
 *       )}
 *
 *   Observation 3 — Network error on /api/admin/sites:
 *     When fetch("/api/admin/sites") throws a network error:
 *       - catch block calls setLoadError("Failed to load sites")
 *       - Rendered popover shows "Failed to load sites" text
 *     Evidence: catch block: if (!cancelled) setLoadError("Failed to load sites");
 *
 * NOTE ON RADIX UI POPOVER:
 *   Radix UI <PopoverContent> renders in a portal appended to document.body,
 *   NOT inside the component's container div. All popover DOM queries must
 *   use document.body or document, not the container.
 *
 * EXPECTED OUTCOME (on UNFIXED code): ALL tests PASS.
 * After the Bug 6 fix (tasks 8.1–8.4), these tests must still PASS.
 *
 * Property 12: Preservation — Happy-path switch and loading states are unchanged
 * Validates: Requirements 3.1, 3.2, 3.3
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetchWithCsrf BEFORE any component import so vi.mock hoisting works.
// ─────────────────────────────────────────────────────────────────────────────
const fetchWithCsrfMock = vi.fn();
vi.mock("@/lib/fetch-csrf", () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrfMock(...args),
}));

// Mock next/navigation — TenantBadgeSwitcher calls router.refresh() on success.
const routerRefreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn() }),
}));

import { TenantBadgeSwitcher } from "@/components/admin/tenant-badge-switcher";

// React 19 createRoot + act: declare as an act environment so state updates
// and chained fetch/setState effects flush synchronously inside act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — two sites returned by the initial lazy-load fetch.
// ─────────────────────────────────────────────────────────────────────────────
const SITE_A = { id: "site-a", name: "Alpha Site", domain: "alpha.example.com" };
const SITE_B = { id: "site-b", name: "Beta Site", domain: "beta.example.com" };
const SITES = [SITE_A, SITE_B];

// ─────────────────────────────────────────────────────────────────────────────
// Global fetch stubs
// ─────────────────────────────────────────────────────────────────────────────

/** Install a global fetch stub that returns valid site data for both endpoints. */
function installSuccessfulGlobalFetch(): typeof fetch {
  const originalFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/api/admin/sites/active")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ activeSiteId: SITE_A.id }),
      } as unknown as Response;
    }
    if (url.includes("/api/admin/sites")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sites: SITES }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });
  return originalFetch;
}

/**
 * Install a global fetch stub that throws a TypeError on /api/admin/sites
 * (simulating a network failure) while succeeding on /api/admin/sites/active.
 */
function installNetworkErrorGlobalFetch(): typeof fetch {
  const originalFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/api/admin/sites/active")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ activeSiteId: null }),
      } as unknown as Response;
    }
    // Both calls go into Promise.all; /api/admin/sites throws → catch is reached.
    if (url.includes("/api/admin/sites")) {
      throw new TypeError("Failed to fetch");
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });
  return originalFetch;
}

/** Flush pending microtasks (chained fetch + setState) several cycles. */
async function flush(cycles = 12): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-test lifecycle
// ─────────────────────────────────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;
let savedOriginalFetch: typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  routerRefreshMock.mockReset();
  fetchWithCsrfMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (savedOriginalFetch) {
    (globalThis as unknown as { fetch: unknown }).fetch = savedOriginalFetch;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOM helpers
// Note: Radix UI PopoverContent renders in a portal appended to document.body,
// so we query document.body (not container) for popover content.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All site-list buttons rendered in the popover content (portal).
 * The PopoverTrigger is excluded by requiring the button to have a
 * data-radix-collection-item attribute or to live outside the container
 * (since Radix portals append to document.body outside container).
 * We use the simplest approach: look for buttons NOT in our container
 * that match a site name, which are the popover site buttons.
 */
function siteButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => !container.contains(b) && SITES.some((s) => (b.textContent ?? "").includes(s.name)),
  );
}

/** Any element with role="alert" in the document. */
function errorAlert(): Element | null {
  return document.querySelector('[role="alert"]');
}

/** Elements with the animate-pulse class (skeleton loaders) in the document. */
function skeletonElements(): NodeListOf<Element> {
  return document.querySelectorAll(".animate-pulse");
}

/** The PopoverTrigger button in the container. */
function triggerButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>("button");
}

/** Open the popover by clicking the trigger. */
async function openPopover(): Promise<void> {
  const trigger = triggerButton();
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
  await flush();
}

// ─────────────────────────────────────────────────────────────────────────────
// Preservation tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 6 preservation — happy-path switch and loading states are unchanged", () => {
  /**
   * Preservation 12a — Successful site switch behavior.
   *
   * OBSERVATION: When `fetchWithCsrf` returns `{ ok: true }`, the component:
   *   1. Updates `activeSiteId` to the selected site's id
   *   2. Closes the popover (`setOpen(false)`)
   *   3. Calls `router.refresh()`
   *
   * After the fix (adding an else branch and switchError state), the `if (res.ok)`
   * path in `handleSelect` is unchanged — this must continue to pass.
   *
   * Property 12: Preservation — Successful site switch behavior unchanged
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it("P12a: successful switch (ok=true) closes popover and calls router.refresh", async () => {
    savedOriginalFetch = installSuccessfulGlobalFetch();

    // Mock fetchWithCsrf to return a successful 200 response.
    fetchWithCsrfMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    // Render the component.
    await act(async () => {
      root.render(<TenantBadgeSwitcher initialSiteName="Alpha Site" isSuperAdmin={false} />);
    });
    await flush();

    // Open the popover.
    await openPopover();

    // Sanity: the site list loaded and both sites are visible in the document.
    const siteBtns = siteButtons();
    expect(siteBtns.length).toBeGreaterThan(0);

    // Click the INACTIVE site (Beta Site) to trigger handleSelect.
    const betaBtn = siteBtns.find((b) => (b.textContent ?? "").includes(SITE_B.name));
    expect(betaBtn).not.toBeUndefined();

    await act(async () => {
      betaBtn!.click();
    });
    await flush();

    // Preservation check 1: router.refresh() was called exactly once.
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    // Preservation check 2: fetchWithCsrf was called with the correct endpoint and body.
    expect(fetchWithCsrfMock).toHaveBeenCalledTimes(1);
    expect(fetchWithCsrfMock).toHaveBeenCalledWith(
      "/api/admin/sites/select",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ siteId: SITE_B.id }),
      }),
    );

    // Preservation check 3: no switch-error element rendered (success path is clean).
    expect(errorAlert()).toBeNull();

    // Preservation check 4: the popover trigger is no longer open.
    // After setOpen(false), Radix sets data-state="closed" on the trigger.
    const trigger = triggerButton();
    if (trigger) {
      expect(trigger.getAttribute("data-state")).not.toBe("open");
    }
  });

  /**
   * Preservation 12b — Loading skeleton renders while the site list loads.
   *
   * OBSERVATION: When `sites === null && !loadError` (initial popover-open
   * state before the fetch resolves), the component renders three skeleton
   * placeholder divs with the `animate-pulse` class.
   *
   * After the fix (adding Zod validation), the loading display logic is unchanged —
   * `sites` starts as `null`, the skeleton renders, then once the fetch resolves
   * `setSites(parsed.data.sites)` populates the list.
   *
   * This test uses a never-resolving fetch to freeze the component in the
   * loading state and directly assert skeleton presence.
   *
   * Property 12: Preservation — Loading skeleton behavior unchanged
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P12b: skeleton placeholders render while the site list is loading (sites === null, no error)", async () => {
    // Install a fetch stub that never resolves for /api/admin/sites, keeping
    // sites === null indefinitely so we can observe the skeleton state.
    const originalFetchInner = globalThis.fetch;
    savedOriginalFetch = originalFetchInner;
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/api/admin/sites/active")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ activeSiteId: null }),
        } as unknown as Response;
      }
      if (url.includes("/api/admin/sites")) {
        // Never resolves — keeps component in loading state.
        return new Promise<Response>(() => {});
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });

    // Render the component.
    await act(async () => {
      root.render(<TenantBadgeSwitcher initialSiteName="Alpha Site" isSuperAdmin={false} />);
    });

    // Open the popover to trigger the lazy-load fetch.
    const trigger = triggerButton();
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.click();
    });

    // Give React one tick to render the popover content (but NOT enough for
    // the never-resolving fetch to complete — it never will).
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Preservation check 1: skeleton elements (animate-pulse) are visible.
    const skeletons = skeletonElements();
    expect(skeletons.length).toBeGreaterThanOrEqual(3);

    // Preservation check 2: no site buttons rendered yet (still loading).
    expect(siteButtons().length).toBe(0);

    // Preservation check 3: no load error rendered (not failed, just pending).
    expect(document.body.textContent).not.toContain("Failed to load sites");
  });

  /**
   * Preservation 12c — Network error on /api/admin/sites sets loadError.
   *
   * OBSERVATION: When `fetch("/api/admin/sites")` throws (network error),
   * the catch block calls `setLoadError("Failed to load sites")`. The rendered
   * popover shows "Failed to load sites" text in a destructive-styled element.
   *
   * After the fix (Zod validation in useEffect), the catch block is unchanged —
   * a thrown network error still calls setLoadError("Failed to load sites").
   *
   * Property 12: Preservation — Network error on /api/admin/sites sets loadError
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it("P12c: network error on /api/admin/sites sets loadError and displays it in the popover", async () => {
    savedOriginalFetch = installNetworkErrorGlobalFetch();

    // Render the component.
    await act(async () => {
      root.render(<TenantBadgeSwitcher initialSiteName="Alpha Site" isSuperAdmin={false} />);
    });
    await flush();

    // Open the popover to trigger the lazy-load (which will throw).
    await openPopover();

    // Preservation check 1: "Failed to load sites" text is visible.
    expect(document.body.textContent).toContain("Failed to load sites");

    // Preservation check 2: the loadError text is rendered inside the popover
    // in a destructive-styled element (text-destructive class).
    const loadErrorEl = Array.from(
      document.querySelectorAll<HTMLElement>(".text-destructive"),
    ).find((el) => (el.textContent ?? "").includes("Failed to load sites"));
    expect(loadErrorEl).not.toBeUndefined();

    // Preservation check 3: no site buttons rendered (sites === null still).
    expect(siteButtons().length).toBe(0);

    // Preservation check 4: no skeleton rendered (error state replaces loading).
    expect(skeletonElements().length).toBe(0);
  });
});
