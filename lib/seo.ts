import type { Metadata } from "next";
import type { SiteDefinition } from "@/config/site-definition";

export interface StaticPageMetadataInput {
  /** Resolved site definition for the current request. */
  site: SiteDefinition;
  /** Title fragment — site name is appended automatically. */
  title: string;
  /** Meta description for search engines + social cards. */
  description: string;
  /** Path on the current site, e.g. `/about`. Must start with `/`. */
  path: string;
  /** Optional absolute or relative OG/Twitter image URL. */
  ogImage?: string;
  /** Open Graph type. Defaults to `"website"`. */
  ogType?: "website" | "article" | "profile";
  /**
   * Twitter card type. Defaults to `"summary_large_image"` when an image is
   * supplied, otherwise `"summary"`.
   */
  twitterCard?: "summary" | "summary_large_image";
  /** When true, marks the page as `noindex, nofollow` for crawlers. */
  noIndex?: boolean;
}

/**
 * Build a consistent SEO `Metadata` object for static public pages.
 *
 * Every public page should expose:
 * - a unique `<title>` and meta description
 * - a canonical URL via `alternates.canonical`
 * - Open Graph tags for social sharing
 * - Twitter Card tags
 *
 * Centralising this here keeps the per-page `generateMetadata` functions
 * focused on the small bits of data unique to each page (title + description).
 */
export function staticPageMetadata({
  site,
  title,
  description,
  path,
  ogImage,
  ogType = "website",
  twitterCard,
  noIndex = false,
}: StaticPageMetadataInput): Metadata {
  const fullUrl = `https://${site.domain}${path}`;
  const fullTitle = `${title} — ${site.name}`;
  const ogImages = ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined;
  const card = twitterCard ?? (ogImage ? "summary_large_image" : "summary");

  return {
    title: fullTitle,
    description,
    alternates: { canonical: fullUrl },
    openGraph: {
      title: fullTitle,
      description,
      url: fullUrl,
      siteName: site.name,
      locale: site.locale,
      type: ogType,
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card,
      title: fullTitle,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
