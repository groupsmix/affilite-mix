import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { listActiveAdPlacements } from "@/lib/dal/ad-placements";
import type { AdPlacementType, AdPlacementRow } from "@/types/database";

interface AdSlotProps {
  placement: AdPlacementType;
}

/**
 * Server component that renders an ad slot based on placement type.
 * Only renders if the site's monetization_type is "ads" or "both".
 * For affiliate-only niches, this renders nothing.
 */
export async function AdSlot({ placement }: AdSlotProps) {
  const site = await getCurrentSite();

  // Check monetization type from DB
  let monetizationType: string = "affiliate";
  try {
    const dbSite = await resolveDbSiteBySlug(site.id);
    if (dbSite) {
      monetizationType = dbSite.monetization_type ?? "affiliate";
    }
  } catch {
    // Default to affiliate
  }

  if (monetizationType !== "ads" && monetizationType !== "both") {
    return null;
  }

  let ads: AdPlacementRow[] = [];
  try {
    const dbSite = await resolveDbSiteBySlug(site.id);
    if (dbSite) {
      ads = await listActiveAdPlacements(dbSite.id, placement);
    }
  } catch {
    return null;
  }

  if (ads.length === 0) return null;

  return (
    <div className="ad-slot" data-placement={placement}>
      {ads.map((ad) => (
        <AdRenderer key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function AdRenderer({ ad }: { ad: AdPlacementRow }) {
  switch (ad.provider) {
    case "adsense":
      return (
        <div className="adsense-ad my-4">
          {ad.ad_code && (
            <div dangerouslySetInnerHTML={{ __html: ad.ad_code }} />
          )}
        </div>
      );
    case "carbon":
      return (
        <div className="carbon-ad my-4" id={`carbon-ad-${ad.id}`}>
          {ad.ad_code && (
            <div dangerouslySetInnerHTML={{ __html: ad.ad_code }} />
          )}
        </div>
      );
    case "ethicalads":
      return (
        <div className="ethical-ad my-4" data-ea-publisher={(ad.config as Record<string, string>).publisher_id ?? ""} data-ea-type="image">
          {ad.ad_code && (
            <div dangerouslySetInnerHTML={{ __html: ad.ad_code }} />
          )}
        </div>
      );
    case "custom":
      return (
        <div className="custom-ad my-4">
          {ad.ad_code && (
            <div dangerouslySetInnerHTML={{ __html: ad.ad_code }} />
          )}
        </div>
      );
    default:
      return null;
  }
}

/** Sidebar ad placement wrapper */
export async function SidebarAd() {
  return <AdSlot placement="sidebar" />;
}

/** In-content ad placement wrapper — inserted between content paragraphs */
export async function InContentAd() {
  return <AdSlot placement="in_content" />;
}

/** Footer ad placement wrapper — above footer */
export async function FooterAd() {
  return <AdSlot placement="footer" />;
}

/** Between posts ad placement wrapper — between post cards in listings */
export async function BetweenPostsAd() {
  return <AdSlot placement="between_posts" />;
}
