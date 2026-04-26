import { describe, it, expect } from "vitest";
import { staticPageMetadata } from "@/lib/seo";
import type { SiteDefinition } from "@/config/site-definition";

const site = {
  id: "test",
  name: "Test Site",
  domain: "example.com",
  language: "en",
  direction: "ltr",
  locale: "en-US",
} as unknown as SiteDefinition;

interface OgShape {
  url?: string | URL;
  siteName?: string;
  locale?: string;
  type?: string;
  images?: { url: string; width: number; height: number }[];
}

interface TwitterShape {
  card?: string;
  title?: string;
  description?: string;
  images?: string[];
}

describe("staticPageMetadata", () => {
  it("builds title, description, canonical, OG and Twitter for a public page", () => {
    const meta = staticPageMetadata({
      site,
      title: "About",
      description: "About this site.",
      path: "/about",
    });

    expect(meta.title).toBe("About — Test Site");
    expect(meta.description).toBe("About this site.");
    expect(meta.alternates?.canonical).toBe("https://example.com/about");

    const og = meta.openGraph as OgShape;
    expect(og.url).toBe("https://example.com/about");
    expect(og.siteName).toBe("Test Site");
    expect(og.locale).toBe("en-US");
    expect(og.type).toBe("website");

    const tw = meta.twitter as TwitterShape;
    expect(tw.card).toBe("summary");
    expect(tw.title).toBe("About — Test Site");

    expect(meta.robots).toBeUndefined();
  });

  it("uses summary_large_image and embeds the image when ogImage is supplied", () => {
    const meta = staticPageMetadata({
      site,
      title: "Deals",
      description: "All deals",
      path: "/deals",
      ogImage: "https://cdn.example.com/og.png",
    });

    const tw = meta.twitter as TwitterShape;
    const og = meta.openGraph as OgShape;
    expect(tw.card).toBe("summary_large_image");
    expect(og.images).toEqual([
      { url: "https://cdn.example.com/og.png", width: 1200, height: 630 },
    ]);
    expect(tw.images).toEqual(["https://cdn.example.com/og.png"]);
  });

  it("emits noindex robots when noIndex is true", () => {
    const meta = staticPageMetadata({
      site,
      title: "Confirm",
      description: "Confirm subscription",
      path: "/newsletter/confirm",
      noIndex: true,
    });

    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("respects an explicit ogType and twitterCard override", () => {
    const meta = staticPageMetadata({
      site,
      title: "Article",
      description: "An article",
      path: "/article",
      ogType: "article",
      twitterCard: "summary_large_image",
    });

    const og = meta.openGraph as OgShape;
    const tw = meta.twitter as TwitterShape;
    expect(og.type).toBe("article");
    expect(tw.card).toBe("summary_large_image");
  });
});
