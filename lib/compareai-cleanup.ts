/**
 * Generic-AI content cleanup for the compareai.site (ai-compared) tenant.
 *
 * The DB still contains pre-niche AI-tool pages (Jasper, Writesonic, etc.). These
 * slugs are excluded from public listings, sitemaps, and direct access so the
 * site only publishes Etsy/POD/AI-workflow content.
 */

export const EXCLUDED_GENERIC_AI_SLUGS = new Set([
  // Generic AI writing / SEO tools
  "best-ai-writing-tools",
  "best-ai-seo-tools",
  "best-ai-video-generators",
  "best-ai-voice-generators",
  "jasper-ai-review",
  "writesonic-review",
  "surfer-seo-review",
  "semrush-review",
  "murf-ai-review",
  "elevenlabs-review",
  "synthesia-review",
  "heygen-review",
  // Generic AI comparisons
  "jasper-vs-writesonic",
  "semrush-vs-surfer-seo",
  "elevenlabs-vs-murf",
  "heygen-vs-synthesia",
]);

export const EXCLUDED_GENERIC_AI_CATEGORIES = new Set([
  "ai-writing",
  "ai-seo",
  "ai-video",
  "ai-voice",
]);

export function isExcludedCompareaiSlug(slug: string): boolean {
  return EXCLUDED_GENERIC_AI_SLUGS.has(slug);
}

export function isExcludedCompareaiCategory(slug: string): boolean {
  return EXCLUDED_GENERIC_AI_CATEGORIES.has(slug);
}

export function filterExcludedCompareaiContent<T extends { slug: string }>(items: T[]): T[] {
  return items.filter((item) => !isExcludedCompareaiSlug(item.slug));
}
