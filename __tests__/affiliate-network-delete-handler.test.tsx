/**
 * @vitest-environment jsdom
 *
 * Affiliate-network delete handler tests (R15).
 *
 * Subject: app/q7m-k4j9/(dashboard)/affiliate-networks/affiliate-network-manager.tsx
 *          → AffiliateNetworkManager.handleDelete
 *
 * These are mocked-fetch handler tests (per the design's "Mocked-fetch handler
 * tests (jsdom)" strategy for R13–R15). `fetchWithCsrf` is mocked so we can
 * drive each branch (OK, non-OK with/without a parseable error body, network
 * rejection) and assert the resulting error banner and whether the item is
 * retained (i.e. onRefresh is NOT called on failure — the list is sourced from
 * props, so a non-success delete leaves the network card visible).
 *
 * Covers Requirements:
 *  - 15.1 non-OK with body message → extract message, setError, item retained
 *  - 15.2 OK     → clear error, success, remove item (onRefresh called)
 *  - 15.3 res.ok checked before treating the delete as successful
 *  - 15.4 non-OK with non-parseable body → generic "Failed to delete", retained
 *  - 15.5 no response (network failure) → "could not be completed", retained
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Mock the CSRF-aware fetch wrapper the handler calls.
const fetchWithCsrf = vi.fn();
vi.mock("@/lib/fetch-csrf", () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

import { AffiliateNetworkManager } from "@/app/q7m-k4j9/(dashboard)/affiliate-networks/affiliate-network-manager";
import type {
  AffiliateNetworkConfig,
  AvailableNetwork,
} from "@/app/q7m-k4j9/(dashboard)/affiliate-networks/page";

// React 19 requires this flag so `act()` flushes effects/microtasks in tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeNetwork(overrides: Partial<AffiliateNetworkConfig> = {}): AffiliateNetworkConfig {
  return {
    id: "net-1",
    site_id: "site-1",
    network: "cj",
    publisher_id: "pub-123",
    api_key_ref: "CJ_API_KEY",
    is_active: true,
    config: {},
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    meta: {
      network: "cj",
      name: "CJ Affiliate",
      description: "Commission Junction network",
      bestFor: "Retail and consumer brands",
      baseUrl: "https://example.com",
      requiresApiKey: true,
      envKeyName: "CJ_API_KEY",
    },
    ...overrides,
  };
}

const availableNetworks: AvailableNetwork[] = [
  {
    network: "cj",
    name: "CJ Affiliate",
    description: "Commission Junction network",
    bestFor: "Retail and consumer brands",
    baseUrl: "https://example.com",
    requiresApiKey: true,
    envKeyName: "CJ_API_KEY",
  },
];

let container: HTMLDivElement;
let root: Root;
let onRefresh: ReturnType<typeof vi.fn>;

function renderManager(configured: AffiliateNetworkConfig[]) {
  onRefresh = vi.fn();
  act(() => {
    root.render(
      <AffiliateNetworkManager
        configured={configured}
        available={availableNetworks}
        loading={false}
        onRefresh={onRefresh}
      />,
    );
  });
}

/** Click the per-network "Remove" button. */
async function clickRemove() {
  const removeBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Remove",
  );
  if (!removeBtn) throw new Error("Remove button not found");
  await act(async () => {
    removeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

function networkIsVisible(name: string): boolean {
  // The network card renders a heading <h3> with the network name.
  return Array.from(container.querySelectorAll("h3")).some((h) => h.textContent?.trim() === name);
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

describe("AffiliateNetworkManager.handleDelete (R15)", () => {
  it("15.1: non-OK with body message → surfaces server error and retains the item", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Network has active links" }),
    });
    const net = makeNetwork();
    renderManager([net]);

    await clickRemove();

    expect(errorBannerText()).toBe("Network has active links");
    // item retained: list is prop-driven and onRefresh (reload) was not called
    expect(onRefresh).not.toHaveBeenCalled();
    expect(networkIsVisible("CJ Affiliate")).toBe(true);
  });

  it("15.3: checks res.ok before success — DELETE issued, no refresh on non-OK", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });
    renderManager([makeNetwork()]);

    await clickRemove();

    // the handler captured a response and branched on ok=false
    expect(fetchWithCsrf).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/affiliate-networks");
    expect(opts.method).toBe("DELETE");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("15.4: non-OK with non-parseable body → generic 'Failed to delete', item retained", async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    const net = makeNetwork();
    renderManager([net]);

    await clickRemove();

    expect(errorBannerText()).toBe("Failed to delete");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(networkIsVisible("CJ Affiliate")).toBe(true);
  });

  it("15.4: non-OK with absent error field → generic 'Failed to delete', item retained", async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false, json: async () => ({}) });
    const net = makeNetwork();
    renderManager([net]);

    await clickRemove();

    expect(errorBannerText()).toBe("Failed to delete");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(networkIsVisible("CJ Affiliate")).toBe(true);
  });

  it("15.2: OK response → clears a previously set error and removes the item (refresh)", async () => {
    const net = makeNetwork();

    // First attempt fails to seed a visible error.
    fetchWithCsrf.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Temporary failure" }),
    });
    renderManager([net]);
    await clickRemove();
    expect(errorBannerText()).toBe("Temporary failure");

    // Second attempt succeeds.
    fetchWithCsrf.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await clickRemove();

    // previously set error cleared and the delete treated as success (refresh).
    expect(errorBannerText()).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("15.5: no response (rejected fetch) → 'could not be completed', item retained", async () => {
    fetchWithCsrf.mockRejectedValue(new TypeError("Failed to fetch"));
    const net = makeNetwork();
    renderManager([net]);

    await clickRemove();

    expect(errorBannerText()).toMatch(/could not be completed/i);
    // NOT treated as success: no refresh, item still shown.
    expect(onRefresh).not.toHaveBeenCalled();
    expect(networkIsVisible("CJ Affiliate")).toBe(true);
  });
});
