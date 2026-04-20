import { getCurrentSite } from "@/lib/site-context";
import { listActiveAdPlacements } from "@/lib/dal/ad-placements";
import type { AdPlacementType, AdPlacementRow } from "@/types/database";
import { SandboxedAd } from "./sandboxed-ad";

interface AdSlotProps {
  placement: AdPlacementType;
}

/**
 * Server component that renders an ad slot based on placement type.
 * Only renders if the site's monetization is "ads" or "both".
 * For affiliate-only niches, this renders nothing.
 *
 * `getCurrentSite()` already exposes the resolved monetization and the DB
 * UUID on `site.id`, so this component no longer performs a per-render DB
 * round-trip just to read `sites.monetization_type`.
 */
export async function AdSlot({ placement }: AdSlotProps) {
  const site = await getCurrentSite();

  if (site.monetization !== "ads" && site.monetization !== "both") {
    return null;
  }

  let ads: AdPlacementRow[] = [];
  try {
    ads = await listActiveAdPlacements(site.id, placement);
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

/**
 * Renders ad code inside a sandboxed iframe to prevent XSS.
 * All providers — including known ones like AdSense — are isolated so that
 * compromised admin accounts or malicious ad snippets cannot access the
 * parent page's DOM, cookies, or storage.
 */
function AdRenderer({ ad }: { ad: AdPlacementRow }) {
  if (!ad.ad_code) return null;

  return (
    <div className={`${ad.provider}-ad my-4`}>
      <SandboxedAd adCode={ad.ad_code} provider={ad.provider} />
    </div>
  );
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
