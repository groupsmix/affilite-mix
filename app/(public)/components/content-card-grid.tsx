import { Fragment } from "react";
import type { ContentRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { ContentCard } from "./content-card";
import { AdSlot } from "./ads/ad-slot";

interface ContentCardGridProps {
  items: ContentRow[];
  locale?: string;
  /**
   * Insert a `between_posts` ad slot after this many cards. The ad only
   * appears when there are more items than `adAfter` (so it lands *between*
   * posts, never after the last one) and an active image placement exists;
   * otherwise the grid is unchanged.
   */
  adAfter?: number;
  className?: string;
}

/**
 * Responsive grid of content cards with an optional `between_posts` ad woven
 * into the feed. Centralises the listing-grid markup so every listing surface
 * (archive, category, taxonomy) renders the `between_posts` placement type,
 * which previously had no render site and so never appeared on the site.
 */
export function ContentCardGrid({
  items,
  locale = "en-US",
  adAfter = 6,
  className,
}: ContentCardGridProps) {
  const showAd = items.length > adAfter;

  return (
    <div className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <ContentCard content={item} locale={locale} />
          {showAd && index === adAfter - 1 && (
            <AdSlot placementType="between_posts" className="col-span-full my-2 px-0" />
          )}
        </Fragment>
      ))}
    </div>
  );
}
