/**
 * Site-aware static guide registry.
 *
 * Each tenant can provide its own guide module; the public guide routes
 * resolve by site slug so content never leaks across tenants.
 */

import { getEtsyGuide, getAllEtsyGuides, getAllEtsyGuideSlugs } from "./etsy-guides";
import { getWatchGuide, getAllWatchGuides, getAllWatchGuideSlugs } from "./watch-guides";

export interface Guide {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  datePublished: string;
  dateModified: string;
  bodyHtml: string;
  primaryKeyword: string;
  excerpt: string;
  tags: string[];
  relatedSlugs: string[];
}

const GUIDE_MODULES: Record<
  string,
  {
    get: (slug: string) => Guide | undefined;
    getAll: () => Guide[];
    getSlugs: () => string[];
  }
> = {
  "ai-compared": {
    get: getEtsyGuide,
    getAll: getAllEtsyGuides,
    getSlugs: getAllEtsyGuideSlugs,
  },
  "watch-tools": {
    get: getWatchGuide,
    getAll: getAllWatchGuides,
    getSlugs: getAllWatchGuideSlugs,
  },
};

function moduleForSite(siteSlug: string) {
  return GUIDE_MODULES[siteSlug] ?? null;
}

export function getSiteGuide(siteSlug: string, slug: string): Guide | undefined {
  return moduleForSite(siteSlug)?.get(slug);
}

export function getAllSiteGuides(siteSlug: string): Guide[] {
  return moduleForSite(siteSlug)?.getAll() ?? [];
}

export function getAllSiteGuideSlugs(siteSlug: string): string[] {
  return moduleForSite(siteSlug)?.getSlugs() ?? [];
}

export function getAllGuideSlugs(): string[] {
  return Object.values(GUIDE_MODULES).flatMap((m) => m.getSlugs());
}
