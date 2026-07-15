import { getCurrentSite } from "@/lib/site-context";
import { listActiveAdPlacements } from "@/lib/dal/ad-placements";
import { getImageAdConfig } from "@/lib/ads/image-ad";
import { shouldSkipDbCall } from "@/lib/db-available";
import { logger } from "@/lib/logger";
import type { AdPlacementType, AdPlacementRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { AdImage } from "./ad-image";

interface AdSlotProps {
  placementType: AdPlacementType;
  className?: string;
}

/**
 * Ads are non-critical chrome rendered in the public layout on every page.
 * The placement lookup must never delay first paint, so it fails open after a
 * short budget: if the DB is slow/unreachable the slot renders nothing rather
 * than blocking SSR (the Supabase client's own retry/backoff can otherwise
 * take tens of seconds when the host is down).
 */
const AD_LOOKUP_TIMEOUT_MS = 1200;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Server component that renders the active ad for a given slot on the public
 * site. Picks the highest-priority active image placement for the current
 * site + placement type. Renders nothing when there is no renderable ad, so it
 * is safe to drop into any layout/page (sites without ads see zero change).
 *
 * Only self-served `image` placements render today. Script/HTML ad networks
 * (adsense/custom) are intentionally not rendered because the CSP `frame-src`
 * does not allow third-party ad frames — enabling those requires a separate,
 * security-reviewed CSP change.
 */
export async function AdSlot({ placementType, className }: AdSlotProps) {
  // Skip the DB round-trip when Supabase is not reachable (build phase,
  // unconfigured/preview environments). This mirrors the guard the public
  // layout uses for its own DB calls and prevents a hung SSR render when no
  // database is available.
  if (shouldSkipDbCall()) return null;

  const site = await getCurrentSite();

  let placements: AdPlacementRow[] | null;
  try {
    placements = await withTimeout(
      listActiveAdPlacements(site.id, placementType),
      AD_LOOKUP_TIMEOUT_MS,
    );
  } catch (err) {
    // An ad slot must never break the page it is embedded in.
    logger.warn("[ad-slot] failed to load placements", {
      placementType,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!placements) return null;

  // placements are ordered by priority ascending; take the first renderable one.
  for (const placement of placements) {
    const config = getImageAdConfig(placement);
    if (!config) continue;

    const label = site.language === "ar" ? "إعلان" : "Ad";
    return (
      <div className={cn("mx-auto w-full max-w-4xl px-4", className)}>
        <AdImage
          placementId={placement.id}
          imageUrl={config.image_url}
          clickUrl={config.click_url}
          alt={config.alt}
          label={label}
        />
      </div>
    );
  }

  return null;
}
