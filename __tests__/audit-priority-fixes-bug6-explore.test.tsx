/**
 * @vitest-environment jsdom
 *
 * Task 1.6 — Bug 6 exploration test (PHASE 1, run on UNFIXED code).
 *
 * BUG: In `handleSelect` inside `TenantBadgeSwitcher`, when `fetchWithCsrf`
 * returns a non-OK HTTP response (e.g. 403, 500), the `if (res.ok)` branch
 * is the only branch — there is no `else`. The `try/finally` block only
 * resets `switching = false`. No error state is set, no toast or inline error
 * message is rendered, and the admin has no indication the site switch failed.
 *
 * GOAL: Prove that after a failed switch (fetchWithCsrf returns { ok: false,
 * status: 403 }), NO visible error message appears inside the popover.
 * On UNFIXED code no `switchError` state exists — the assertion that an error
 * message appears therefore FAILS, confirming the bug.
 *
 * Scoped PBT Approach:
 *   1. Render <TenantBadgeSwitcher> under jsdom.
 *   2. Mock the initial /api/admin/sites and /api/admin/sites/active fetches
 *      (global fetch) to return a valid site list so the popover populates.
 *   3. Mock fetchWithCsrf to return { ok: false, status: 403 }.
 *   4. Open the popover, click a site button.
 *   5. Assert that a visible error message (role="alert" or text matching
 *      "Failed to switch site" / similar) appears inside the popover.
 *   → On UNFIXED code no such element exists, so the assertion FAILS.
 *
 * EXPECTED OUTCOME (on UNFIXED code): Test FAILS.
 *   POST 403 → no inline error, `switching` resets silently.
 *
 * Documented counterexample:
 *   fetchWithCsrf("/api/admin/sites/select", { method: "POST", ... })
 *   returns { ok: false, status: 403 }
 *   → no element with role="alert" rendered in the popover
 *   → no text "Failed to switch site" rendered anywhere
 *   → switchError remains null (state variable doesn't even exist on unfixed code)
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetchWithCsrf BEFORE any component import so vi.mock hoisting works.
// On UNFIXED code handleSelect has no else branch, so the mock returning
// { ok: false } causes a silent failure with no rendered error.
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
// Test fixtures — two sites that the initial load returns so the popover
// renders a list of clickable site buttons.
// ─────────────────────────────────────────────────────────────────────────────
const SITE_A = { id: "site-a", name: "Alpha Site", domain: "alpha.example.com" };
const SITE_B = { id: "site-b", name: "Beta Site", domain: "beta.example.com" };
const SITES = [SITE_A, SITE_B];

/**
 * Install a global fetch stub that answers the two lazy-load endpoints the
 * component calls when the popover first opens:
 *   GET /api/admin/sites        → { sites: [...] }
 *   GET /api/admin/sites/active → { activeSiteId: "site-a" }
 *
 * All other URLs return 200 OK with an empty body.
 */
function installGlobalFetch() {
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

/** Flush pending microtasks (chained fetch + setState) several cycles. */
async function flush(cycles = 8): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  routerRefreshMock.mockReset();
  fetchWithCsrfMock.mockReset();
  originalFetch = installGlobalFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: render the component and open the popover, waiting for the site list
// to load. Returns after the site buttons are visible.
// ─────────────────────────────────────────────────────────────────────────────
async function renderAndOpenPopover(): Promise<void> {
  await act(async () => {
    root.render(<TenantBadgeSwitcher initialSiteName="Alpha Site" isSuperAdmin={false} />);
  });
  await flush();

  // Click the PopoverTrigger button to open the popover.
  const trigger = container.querySelector<HTMLButtonElement>("button");
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
  await flush();
}

/**
 * All site-list buttons rendered in the popover content (portal).
 * NOTE: Radix UI <PopoverContent> renders in a portal appended to document.body,
 * NOT inside the component's container div. We query document (not container)
 * and exclude the trigger button (which lives in container).
 */
function siteButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => !container.contains(b) && SITES.some((s) => (b.textContent ?? "").includes(s.name)),
  );
}

/** The first visible error alert element in the document (popover portal), if any. */
function errorAlert(): Element | null {
  return document.querySelector('[role="alert"]');
}

/** Any text in the document (including popover portal) matching a switch-failure message pattern. */
function hasSwitchErrorText(): boolean {
  const text = document.body.textContent ?? "";
  return (
    text.toLowerCase().includes("failed to switch") ||
    (text.toLowerCase().includes("switch site") && text.toLowerCase().includes("failed")) ||
    text.toLowerCase().includes("try again") ||
    (text.toLowerCase().includes("error") && text.toLowerCase().includes("switch"))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug 6 exploration — handleSelect silently ignores non-OK HTTP responses", () => {
  /**
   * Property 6a: Bug Condition — a 403 response from the switch endpoint
   * MUST render a visible error message (role="alert") in the popover.
   *
   * On UNFIXED code: `handleSelect` has no `else` branch on `if (res.ok)`.
   * When `fetchWithCsrf` returns `{ ok: false, status: 403 }`, the function
   * resets `switching` via `finally` and returns with no state change.
   * No `switchError` state variable exists, no error element is rendered.
   *
   * The assertion `expect(errorAlert()).not.toBeNull()` therefore FAILS on
   * unfixed code, confirming the bug.
   *
   * Documented counterexample:
   *   POST /api/admin/sites/select → { ok: false, status: 403 }
   *   → container.querySelector('[role="alert"]') === null
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 6a: after a 403 response, a role=alert error element MUST appear in the popover", async () => {
    // Mock the site-switch POST to return a non-OK 403 response.
    fetchWithCsrfMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    } as unknown as Response);

    await renderAndOpenPopover();

    const siteBtns = siteButtons();
    // Sanity: site list loaded and at least the inactive site is clickable.
    expect(siteBtns.length).toBeGreaterThan(0);

    // Click the INACTIVE site (Beta Site — not the active one) to trigger handleSelect.
    const betaBtn = siteBtns.find((b) => (b.textContent ?? "").includes(SITE_B.name));
    expect(betaBtn).not.toBeUndefined();

    await act(async () => {
      betaBtn!.click();
    });
    await flush();

    // Bug-condition check: on UNFIXED code no role="alert" element exists.
    // This assertion FAILS on unfixed code, confirming the bug.
    expect(errorAlert()).not.toBeNull();
  });

  /**
   * Property 6b: Bug Condition — a 500 response from the switch endpoint
   * MUST render a visible error message (text content includes switch failure
   * indication) and must NOT call router.refresh() (success path skipped).
   *
   * On UNFIXED code the silent failure also means router.refresh() is never
   * called (the setActiveSiteId / router.refresh block requires res.ok). But
   * the KEY failure for this bug is the absence of user-visible feedback.
   *
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it("Property 6b: after a 500 response, switch-error text MUST appear and router.refresh MUST NOT be called", async () => {
    fetchWithCsrfMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    } as unknown as Response);

    await renderAndOpenPopover();

    const siteBtns = siteButtons();
    const betaBtn = siteBtns.find((b) => (b.textContent ?? "").includes(SITE_B.name));
    expect(betaBtn).not.toBeUndefined();

    await act(async () => {
      betaBtn!.click();
    });
    await flush();

    // Bug-condition check: on UNFIXED code no switch-error text exists.
    // This assertion FAILS on unfixed code, confirming the bug.
    expect(hasSwitchErrorText()).toBe(true);

    // Preservation check: router.refresh() must NOT be called on failure
    // (this already passes on unfixed code — the if(res.ok) guards it).
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  /**
   * Property 6c: Control — verify the happy path (200 OK) still works as
   * expected on unfixed code. This assertion PASSES on both unfixed and fixed
   * code, serving as a regression guard for the success path.
   *
   * After a successful switch:
   *   - router.refresh() IS called
   *   - No error element appears
   *
   * Validates: Requirements 3.1 (Preservation)
   */
  it("Property 6c (control/preservation): after a 200 OK switch, router.refresh IS called and no error appears", async () => {
    fetchWithCsrfMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    await renderAndOpenPopover();

    const siteBtns = siteButtons();
    const betaBtn = siteBtns.find((b) => (b.textContent ?? "").includes(SITE_B.name));
    expect(betaBtn).not.toBeUndefined();

    await act(async () => {
      betaBtn!.click();
    });
    await flush();

    // The success path: router.refresh() called, no error banner.
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    expect(errorAlert()).toBeNull();
  });
});
