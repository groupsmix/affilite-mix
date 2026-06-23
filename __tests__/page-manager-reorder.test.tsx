/**
 * @vitest-environment jsdom
 *
 * R13 — Page reorder surfaces failures (audit-fix-verification).
 *
 * Mocked-fetch handler tests for the admin page editor's reorder controls
 * (`handleMoveUp` / `handleMoveDown` in
 * `app/q7m-k4j9/(dashboard)/pages/page-manager.tsx`). The component is a
 * `"use client"` React component that calls `fetchWithCsrf` and branches on
 * `res.ok`. We render it under jsdom with `fetchWithCsrf` fully mocked and
 * drive the reorder buttons, then assert the resulting error banner / list
 * order / call counts.
 *
 * Covers R13.1–R13.7.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// The component's only non-React dependency is the CSRF-aware fetch wrapper.
// Mock the whole module so we control every reorder/load response and so the
// transitive `sonner` / csrf imports never load in the test env.
vi.mock("@/lib/fetch-csrf", () => ({
  fetchWithCsrf: vi.fn(),
}));

import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { PageManager } from "@/app/q7m-k4j9/(dashboard)/pages/page-manager";

// React 19 createRoot + act: declare this as an act environment so state
// updates flush synchronously inside act() without warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mock = vi.mocked(fetchWithCsrf);

interface PageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function makePage(id: string, title: string, sort: number): PageRow {
  return {
    id,
    slug: title.toLowerCase(),
    title,
    body: "",
    is_published: true,
    sort_order: sort,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

// The persisted order the GET /api/admin/pages endpoint always returns. After
// any failed reorder the component reloads from here, so the displayed order
// must revert to this exact sequence.
let persistedPages: PageRow[];

// Per-test responder for the reorder PUT. Defaults to a successful response.
let reorderResponder: () => Promise<unknown>;

let container: HTMLDivElement;
let root: Root;

const REORDER_URL = "/api/admin/pages/reorder";
const PAGES_URL = "/api/admin/pages";

function isGetPages(url: string, opts?: RequestInit): boolean {
  return url === PAGES_URL && (!opts || opts.method === undefined || opts.method === "GET");
}

beforeEach(() => {
  persistedPages = [makePage("p1", "Alpha", 0), makePage("p2", "Beta", 1)];
  reorderResponder = async () => ({ ok: true });

  mock.mockReset();
  mock.mockImplementation((async (url: string, opts?: RequestInit) => {
    if (isGetPages(url, opts)) {
      return { ok: true, json: async () => persistedPages.map((p) => ({ ...p })) } as Response;
    }
    if (url === REORDER_URL) {
      return reorderResponder() as Promise<Response>;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetchWithCsrf);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

/** Flush pending microtasks (awaited fetch + res.json chains) inside act. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderManager(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<PageManager />);
  });
  await flush();
}

function moveButtons(kind: "Move up" | "Move down"): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(`button[title="${kind}"]`));
}

async function click(btn: HTMLButtonElement): Promise<void> {
  await act(async () => {
    btn.click();
  });
  await flush();
}

function displayedTitles(): string[] {
  return Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim() ?? "");
}

function reorderCalls(): unknown[][] {
  return mock.mock.calls.filter((c) => c[0] === REORDER_URL);
}

function getCalls(): unknown[][] {
  return mock.mock.calls.filter((c) => isGetPages(c[0] as string, c[1] as RequestInit));
}

function bannerText(): string {
  return container.querySelector('[role="alert"]')?.textContent?.trim() ?? "";
}

function formIsOpen(): boolean {
  // The create/edit form renders an <h2> heading ("Create Page" / "Edit Page").
  return container.querySelector("h2") !== null;
}

describe("PageManager reorder — R13", () => {
  it("13.2: an OK reorder response reloads the page list via loadPages", async () => {
    await renderManager();
    expect(displayedTitles()).toEqual(["Alpha", "Beta"]);
    const getsBefore = getCalls().length;

    // Move "Alpha" down (index 0 -> down is enabled).
    await click(moveButtons("Move down")[0]!);

    expect(reorderCalls()).toHaveLength(1);
    // loadPages() ran again after the OK response.
    expect(getCalls().length).toBe(getsBefore + 1);
    // No error surfaced on success.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("13.1 + 13.4: a non-OK response sets a save error and restores the persisted order", async () => {
    reorderResponder = async () => ({ ok: false, json: async () => ({ error: "boom" }) });
    await renderManager();

    await click(moveButtons("Move down")[0]!);

    // 13.1: error indicating the new order could not be saved.
    expect(bannerText()).toContain("Could not save the new order.");
    // 13.4: loadPages restored the previously persisted order.
    expect(displayedTitles()).toEqual(["Alpha", "Beta"]);
  });

  it("13.3: the error banner is visible while the page form is closed", async () => {
    reorderResponder = async () => ({ ok: false });
    await renderManager();

    expect(formIsOpen()).toBe(false);
    await click(moveButtons("Move down")[0]!);

    // Form is still closed, yet the reorder error is surfaced to the user.
    expect(formIsOpen()).toBe(false);
    expect(bannerText()).toContain("Could not save the new order.");
  });

  it("13.5: a network error (no response) sets an error and restores the persisted order", async () => {
    reorderResponder = async () => {
      throw new Error("connection reset");
    };
    await renderManager();

    await click(moveButtons("Move down")[0]!);

    // The reorder could not be completed — an error is surfaced...
    expect(bannerText()).toContain("Could not save the new order.");
    // ...and the previously persisted order is restored.
    expect(displayedTitles()).toEqual(["Alpha", "Beta"]);
  });

  it("13.6: additional reorder requests are ignored while one is in flight", async () => {
    let resolveReorder: (v: { ok: boolean }) => void = () => {};
    const pending = new Promise<{ ok: boolean }>((resolve) => {
      resolveReorder = resolve;
    });
    reorderResponder = () => pending;

    await renderManager();

    // First click starts an in-flight reorder that never resolves yet.
    await act(async () => {
      moveButtons("Move down")[0]!.click();
    });
    await flush();

    expect(reorderCalls()).toHaveLength(1);

    // Buttons are disabled while reordering; attempt further reorders anyway.
    moveButtons("Move down").forEach((b) => b.click());
    moveButtons("Move up").forEach((b) => b.click());
    await flush();

    // The in-flight guard ignored every additional request.
    expect(reorderCalls()).toHaveLength(1);

    // Resolve the in-flight request; the guard releases afterward.
    await act(async () => {
      resolveReorder({ ok: true });
    });
    await flush();
  });

  it("13.7: already-first move-up and already-last move-down take no reorder action", async () => {
    await renderManager();

    const ups = moveButtons("Move up");
    const downs = moveButtons("Move down");

    // First row's move-up and last row's move-down are boundary no-ops.
    expect(ups[0]!.disabled).toBe(true);
    expect(downs[downs.length - 1]!.disabled).toBe(true);

    await click(ups[0]!); // already first
    await click(downs[downs.length - 1]!); // already last

    // No reorder request was issued for either boundary action.
    expect(reorderCalls()).toHaveLength(0);
    expect(displayedTitles()).toEqual(["Alpha", "Beta"]);
  });
});
