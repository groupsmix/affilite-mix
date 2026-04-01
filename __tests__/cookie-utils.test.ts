import { describe, it, expect } from "vitest";
import { getCookieValue, IS_SECURE_COOKIE } from "@/lib/cookie-utils";

describe("IS_SECURE_COOKIE", () => {
  it("is a boolean", () => {
    expect(typeof IS_SECURE_COOKIE).toBe("boolean");
  });

  it("is false in test environment (NODE_ENV !== production)", () => {
    expect(IS_SECURE_COOKIE).toBe(false);
  });
});

describe("getCookieValue (server context)", () => {
  it("returns null when document is undefined (server-side)", () => {
    // In Node/Vitest without jsdom, `document` is undefined
    expect(getCookieValue("any_cookie")).toBeNull();
  });
});
