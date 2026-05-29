/**
 * FIX-22 (F-022): Tests for centralised outbound fetch with hostname allow-list.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchAllowed,
  fetchAllowedWithTimeout,
  DisallowedHostnameError,
  __resetFetchAllowedCache,
} from "@/lib/fetch-allowed";

describe("fetch-allowed", () => {
  beforeEach(() => {
    __resetFetchAllowedCache();
    delete (process.env as Record<string, string>).OUTBOUND_ALLOWED_HOSTNAMES;
  });

  it("allows fetch to stripe api", { timeout: 15_000 }, async () => {
    // We only care that the allow-list lets api.stripe.com through, not
    // whether the upstream request succeeds. The call may resolve (e.g. with a
    // 401) or reject (network error), but neither outcome should be a
    // DisallowedHostnameError.
    let err: unknown;
    try {
      await fetchAllowed("https://api.stripe.com/v1/charges");
    } catch (caught) {
      err = caught;
    }
    expect(err).not.toBeInstanceOf(DisallowedHostnameError);
  });

  it("blocks fetch to disallowed hostname", async () => {
    await expect(fetchAllowed("https://evil.com/malware")).rejects.toBeInstanceOf(
      DisallowedHostnameError,
    );
  });

  it("blocks fetch to internal metadata endpoint", async () => {
    await expect(fetchAllowed("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      DisallowedHostnameError,
    );
  });

  it("respects OUTBOUND_ALLOWED_HOSTNAMES env var", { timeout: 15_000 }, async () => {
    process.env.OUTBOUND_ALLOWED_HOSTNAMES = "custom.example.com,api.partner.io";
    __resetFetchAllowedCache();

    // Should not throw for allowed host
    await expect(fetchAllowed("https://custom.example.com/api")).rejects.not.toBeInstanceOf(
      DisallowedHostnameError,
    );

    // Should throw for disallowed host
    await expect(fetchAllowed("https://other.com/api")).rejects.toBeInstanceOf(
      DisallowedHostnameError,
    );
  });

  it("supports wildcard hostnames in env var", { timeout: 15_000 }, async () => {
    process.env.OUTBOUND_ALLOWED_HOSTNAMES = "*.internal.example.com";
    __resetFetchAllowedCache();

    await expect(fetchAllowed("https://api.internal.example.com/v1")).rejects.not.toBeInstanceOf(
      DisallowedHostnameError,
    );

    await expect(fetchAllowed("https://other.example.com/v1")).rejects.toBeInstanceOf(
      DisallowedHostnameError,
    );
  });

  it("fetchAllowedWithTimeout aborts after timeout", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const timer = setTimeout(() => _resolve(new Response()), 60_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    try {
      const promise = fetchAllowedWithTimeout(
        "https://api.stripe.com/v1/charges",
        {},
        1, // 1ms timeout
      );
      await expect(promise).rejects.toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
