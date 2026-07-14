import { getCurrentSite } from "@/lib/site-context";
import { getTenantClient } from "@/lib/supabase-server";
import { listActiveAdPlacements } from "@/lib/dal/ad-placements";
import { getImageAdConfig } from "@/lib/ads/image-ad";
import type { AdPlacementType } from "@/types/database";
import { cn } from "@/lib/utils";
import { AdImage } from "./ad-image";

interface AdSlotProps {
  placementType: AdPlacementType;
  className?: string;
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
  const site = await getCurrentSite();

  const placements = await listActiveAdPlacements(site.id, placementType, () => getTenantClient());

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
