import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCookieValue, IS_SECURE_COOKIE } from "@/lib/cookie-utils";

describe("IS_SECURE_COOKIE", () => {
  it("is false in the test environment (not production)", () => {
    expect(IS_SECURE_COOKIE).toBe(false);
  });
});

describe("getCookieValue", () => {
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    // Save original document
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    // Restore original document
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  it("returns null when document is undefined (server-side)", () => {
    Object.defineProperty(globalThis, "document", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("test")).toBeNull();
  });

  it("returns the value of an existing cookie", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "foo=bar; baz=qux" },
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("foo")).toBe("bar");
    expect(getCookieValue("baz")).toBe("qux");
  });

  it("returns null for a non-existent cookie", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "foo=bar" },
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("missing")).toBeNull();
  });

  it("handles URL-encoded cookie values", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "name=hello%20world" },
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("name")).toBe("hello world");
  });

  it("falls back to raw value when decodeURIComponent fails", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "bad=%E0%A4%A" },
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("bad")).toBe("%E0%A4%A");
  });

  it("returns null for empty cookie string", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "" },
      writable: true,
      configurable: true,
    });
    expect(getCookieValue("anything")).toBeNull();
  });
});
