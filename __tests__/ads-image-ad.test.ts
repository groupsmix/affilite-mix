/**
 * Unit tests for the self-served image/banner ad config validation.
 * Covers the rules enforced by /api/admin/ads (create + edit) and the
 * render-time parser used by the public AdSlot.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseImageAdConfig,
  isRenderableImageUrl,
  isSafeClickUrl,
  getImageAdConfig,
} from "@/lib/ads/image-ad";

const R2 = "https://cdn.example.r2.dev";

describe("image-ad config validation", () => {
  const prev = process.env.R2_PUBLIC_URL;
  beforeEach(() => {
    process.env.R2_PUBLIC_URL = R2;
  });
  afterEach(() => {
    process.env.R2_PUBLIC_URL = prev;
  });

  it("accepts a complete, allow-listed config", () => {
    const result = parseImageAdConfig({
      image_url: `${R2}/ads/banner.jpg`,
      click_url: "https://sponsor.example.com/landing",
      alt: "Sponsor banner",
    });
    expect(result).toEqual({
      image_url: `${R2}/ads/banner.jpg`,
      click_url: "https://sponsor.example.com/landing",
      alt: "Sponsor banner",
    });
  });

  it("rejects a missing image", () => {
    const result = parseImageAdConfig({ click_url: "https://x.example.com" });
    expect("error" in result).toBe(true);
  });

  it("rejects an image on a non-allow-listed host (would be CSP-blocked)", () => {
    const result = parseImageAdConfig({
      image_url: "https://evil.cdn.example/banner.jpg",
      click_url: "https://x.example.com",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects a missing or unsafe click URL", () => {
    expect("error" in parseImageAdConfig({ image_url: `${R2}/a.jpg` })).toBe(true);
    expect(
      "error" in parseImageAdConfig({ image_url: `${R2}/a.jpg`, click_url: "javascript:alert(1)" }),
    ).toBe(true);
  });

  it("isRenderableImageUrl requires https + allow-listed host", () => {
    expect(isRenderableImageUrl(`${R2}/a.jpg`)).toBe(true);
    expect(isRenderableImageUrl("http://cdn.example.r2.dev/a.jpg")).toBe(false);
    expect(isRenderableImageUrl("https://m.media-amazon.com/x.jpg")).toBe(true);
    expect(isRenderableImageUrl("not a url")).toBe(false);
  });

  it("isSafeClickUrl allows http(s) only", () => {
    expect(isSafeClickUrl("https://x.example.com")).toBe(true);
    expect(isSafeClickUrl("http://x.example.com")).toBe(true);
    expect(isSafeClickUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeClickUrl("mailto:x@example.com")).toBe(false);
  });

  it("getImageAdConfig returns null for non-image providers", () => {
    expect(
      getImageAdConfig({
        provider: "custom",
        config: { image_url: `${R2}/a.jpg`, click_url: "https://x.example.com" },
      }),
    ).toBeNull();
  });

  it("getImageAdConfig returns null when an image placement is incomplete", () => {
    expect(getImageAdConfig({ provider: "image", config: {} })).toBeNull();
  });

  it("getImageAdConfig returns the parsed config for a valid image placement", () => {
    expect(
      getImageAdConfig({
        provider: "image",
        config: { image_url: `${R2}/a.jpg`, click_url: "https://x.example.com", alt: "a" },
      }),
    ).toEqual({ image_url: `${R2}/a.jpg`, click_url: "https://x.example.com", alt: "a" });
  });
});
