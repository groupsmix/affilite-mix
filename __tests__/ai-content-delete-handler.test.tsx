/**
 * @vitest-environment jsdom
 *
 * AI-content delete handler tests (R14).
 *
 * Subject: app/q7m-k4j9/(dashboard)/ai-content/ai-content-manager.tsx
 *          → AIContentManager.handleDelete
 *
 * These are mocked-fetch handler tests (per the design's "Mocked-fetch handler
 * tests (jsdom)" strategy for R13–R15). `fetchWithCsrf` is mocked so we can
 * drive each branch (OK, non-OK with/without error body, network rejection)
 * and assert the resulting error banner and whether the item is retained
 * (i.e. onRefresh is NOT called on failure — the list is sourced from props,
 * so a non-success delete leaves the draft visible).
 *
 * Covers Requirements:
 *  - 14.1 non-OK → extract server error message, setError, item retained
 *  - 14.2 OK     → success, clears a previously set error
 *  - 14.3 res.ok checked before treating the delete as successful
 *  - 14.4 non-OK with absent/empty error field → default "Delete failed"
 *  - 14.5 network failure → "could not be completed", NOT treated as success
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Mock the CSRF-aware fetch wrapper the handler calls.
const fetchWithCsrf = vi.fn();
vi.mock("@/lib/fetch-csrf", () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

// sanitize-html is only exercised in the preview panel (never opened here),
// but keep the module graph cheap/deterministic.
vi.mock("@/lib/sanitize-html", () => ({ sanitizeHtml: (s: string) => s }));

import { AIContentManager } from "@/app/q7m-k4j9/(dashboard)/ai-content/ai-content-manager";
import type { AIDraft } from "@/app/q7m-k4j9/(dashboard)/ai-content/page";

// React 19 requires this flag so `act()` flushes effects/microtasks in tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeDraft(overrides: Partial<AIDraft> = {}): AIDraft {
  return {
    id: "draft-1",
    site_id: "site-1",
    title: "Best Luxury Watches Under $500",
    slug: "best-luxury-watches",
    body: "<p>body</p>",
    excerpt: "An excerpt",
    content_type: "article",
    topic: "watches",
    keywords: ["luxury", "watch"],
    ai_provider: "openai",
    status: "pending",
    generated_at: "2024-01-01T00:00:00.000Z",
    reviewed_at: null,
    reviewed_by: null,
    meta_title: null,
    meta_description: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let onRefresh: () => void;

function renderManager(drafts: AIDraft[]) {
  onRefresh = vi.fn<() => void>();
  act(() => {
    root.render(
      <AIContentManager
        drafts={drafts}
        loading={false}
        statusFilter="pending"
        onStatusFilterChange={() => {}}
        onRefresh={onRefresh}
      />,
    );
  });
}

/** Click the per-draft "Delete" button (the action button, not a tab). */
async function clickDelete() {
  const deleteBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Delete",
  );
  if (!deleteBtn) throw new Error("Delete button not found");
  await act(async () => {
    deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // let the awaited fetch + state updates settle
    await Promise.resolve();
    await Promise.resolve();
  });
}

function errorBannerText(): string | null {
  // The error banner is the red box; grab its leading text node content.
  const banner = container.querySelector(".bg-red-50");
  if (!banner) return null;
  // strip the trailing "Dismiss" button text
  return (banner.textContent ?? "").replace(/Dismiss\s*$/, "").trim();
}

function draftIsVisible(title: string): boolean {
  return (container.textContent ?? "").includes(title);
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  // handleDelete is gated behind window.confirm — auto-accept.
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("AIContentManager.handleDelete (R14)", () => {
  it("14.1: non-OK response → surfaces server error and retains the item", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Draft is locked by another admin" }),
    });
    const draft = makeDraft();
    renderManager([draft]);

    await clickDelete();

    expect(errorBannerText()).toBe("Draft is locked by another admin");
    // item retained: list is prop-driven and onRefresh (reload) was not called
    expect(onRefresh).not.toHaveBeenCalled();
    expect(draftIsVisible(draft.title)).toBe(true);
  });

  it("14.3: checks res.ok before success — DELETE issued, no refresh on non-OK", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });
    renderManager([makeDraft()]);

    await clickDelete();

    // the handler captured a response and branched on ok=false
    expect(fetchWithCsrf).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/ai-content");
    expect(opts.method).toBe("DELETE");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("14.4: non-OK with absent error field → default 'Delete failed'", async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderManager([makeDraft()]);

    await clickDelete();

    expect(errorBannerText()).toBe("Delete failed");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("14.4: non-OK with empty-string error field → default 'Delete failed'", async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false, json: async () => ({ error: "" }) });
    renderManager([makeDraft()]);

    await clickDelete();

    expect(errorBannerText()).toBe("Delete failed");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("14.4: non-OK with unparseable JSON body → default 'Delete failed', item retained", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    const draft = makeDraft();
    renderManager([draft]);

    await clickDelete();

    expect(errorBannerText()).toBe("Delete failed");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(draftIsVisible(draft.title)).toBe(true);
  });

  it("14.2: OK response → treated as success and clears a previously set error", async () => {
    const draft = makeDraft();

    // First attempt fails to seed a visible error.
    fetchWithCsrf.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Temporary failure" }),
    });
    renderManager([draft]);
    await clickDelete();
    expect(errorBannerText()).toBe("Temporary failure");

    // Second attempt succeeds.
    fetchWithCsrf.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await clickDelete();

    // previously set error cleared and the delete treated as success (refresh).
    expect(errorBannerText()).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("14.5: network failure (rejected fetch) → 'could not be completed', not a success", async () => {
    fetchWithCsrf.mockRejectedValue(new TypeError("Failed to fetch"));
    const draft = makeDraft();
    renderManager([draft]);

    await clickDelete();

    expect(errorBannerText()).toMatch(/could not be completed/i);
    // NOT treated as success: no refresh, item still shown.
    expect(onRefresh).not.toHaveBeenCalled();
    expect(draftIsVisible(draft.title)).toBe(true);
  });
});
