import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { sanitizeClickReferrer, shouldSkipClickAnalytics } from "@/lib/click-analytics";

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest("https://compareai.site/r/test-product", { headers });
}

describe("sanitizeClickReferrer", () => {
  it("keeps only origin and pathname", () => {
    expect(sanitizeClickReferrer("https://compareai.site/review?email=user@example.com#frag")).toBe(
      "https://compareai.site/review",
    );
  });

  it("drops CR/LF/NUL injection attempts", () => {
    expect(sanitizeClickReferrer("https://compareai.site/re\r\nview")).toBe(
      "https://compareai.site/review",
    );
  });

  it("drops referrers that are not URLs", () => {
    expect(sanitizeClickReferrer("not a url")).toBeUndefined();
    expect(sanitizeClickReferrer("")).toBeUndefined();
    expect(sanitizeClickReferrer(null)).toBeUndefined();
  });

  it("bounds the stored length", () => {
    const long = `https://compareai.site/${"a".repeat(5000)}`;
    expect(sanitizeClickReferrer(long)!.length).toBeLessThanOrEqual(2048);
  });
});

describe("shouldSkipClickAnalytics", () => {
  it("trusts top-level navigations", () => {
    for (const site of ["none", "same-origin", "same-site"]) {
      expect(
        shouldSkipClickAnalytics(
          requestWith({ "sec-fetch-site": site, "sec-fetch-dest": "document" }),
        ),
      ).toBe(false);
    }
  });

  it("skips cross-site and header-less requests", () => {
    expect(shouldSkipClickAnalytics(requestWith({}))).toBe(true);
    expect(shouldSkipClickAnalytics(requestWith({ "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("skips sub-resource destinations even from a trusted site", () => {
    expect(
      shouldSkipClickAnalytics(
        requestWith({ "sec-fetch-site": "same-origin", "sec-fetch-dest": "image" }),
      ),
    ).toBe(true);
    expect(
      shouldSkipClickAnalytics(
        requestWith({ "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty" }),
      ),
    ).toBe(true);
  });
});
