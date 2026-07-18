import type { AdPlacementRow } from "@/types/database";
import { getCspExternalHosts } from "@/lib/csp";

/**
 * Self-served image/banner ad configuration.
 *
 * Stored in `ad_placements.config` when `provider === "image"`. The creative
 * is uploaded through the dashboard image uploader (which stores it in R2, an
 * origin already allow-listed in the CSP `img-src`) and the owner sets a
 * click-through destination. `ad_code` stays null for image ads.
 */
export interface ImageAdConfig {
  image_url: string;
  click_url: string;
  alt: string;
}

/** Amazon media CDNs — kept in sync with the CSP `img-src` allow-list. */
const AMAZON_IMAGE_HOSTS = ["m.media-amazon.com", "images-na.ssl-images-amazon.com"];

export const MAX_ALT_LENGTH = 300;

/**
 * Hostnames whose images the browser will actually render. Mirrors the CSP
 * `img-src` allow-list in `lib/csp.ts` so a creative saved here is guaranteed
 * to render on the public site rather than being silently blocked.
 */
export function allowedImageHosts(): string[] {
  const { supabase, r2 } = getCspExternalHosts();
  const hosts = [...AMAZON_IMAGE_HOSTS];
  for (const origin of [supabase, r2]) {
    if (!origin) continue;
    try {
      hosts.push(new URL(origin).hostname);
    } catch {
      // ignore malformed origin
    }
  }
  return hosts;
}

/** True when `url` is https and its host is allow-listed by the CSP img-src. */
export function isRenderableImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return allowedImageHosts().includes(parsed.hostname);
}

/** True when `url` is a syntactically valid http(s) click destination. */
export function isSafeClickUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

/**
 * Validate and normalise an image ad's config. Returns the cleaned config or
 * an object with a human-readable `error`.
 */
export function parseImageAdConfig(config: unknown): ImageAdConfig | { error: string } {
  const c = (config ?? {}) as Record<string, unknown>;
  const imageUrl = typeof c.image_url === "string" ? c.image_url.trim() : "";
  const clickUrl = typeof c.click_url === "string" ? c.click_url.trim() : "";
  const alt = typeof c.alt === "string" ? c.alt.trim() : "";

  if (!imageUrl) return { error: "An image is required for an image/banner ad." };
  if (!isRenderableImageUrl(imageUrl)) {
    return {
      error:
        "The ad image must be uploaded here (it is stored on the site's own CDN). Pasted third-party image URLs are blocked by the content-security policy and would not render.",
    };
  }
  if (!clickUrl) return { error: "A click-through URL is required for an image/banner ad." };
  if (!isSafeClickUrl(clickUrl)) {
    return { error: "The click-through URL must be a valid http(s) URL." };
  }
  if (alt.length > MAX_ALT_LENGTH) {
    return { error: `Alt text is too long (max ${MAX_ALT_LENGTH} characters).` };
  }
  return { image_url: imageUrl, click_url: clickUrl, alt };
}

/**
 * Read a stored image ad config for rendering. Returns null when the placement
 * is not an image ad or its config is incomplete/invalid.
 */
export function getImageAdConfig(
  placement: Pick<AdPlacementRow, "provider" | "config">,
): ImageAdConfig | null {
  if (placement.provider !== "image") return null;
  const parsed = parseImageAdConfig(placement.config);
  if ("error" in parsed) return null;
  return parsed;
}
