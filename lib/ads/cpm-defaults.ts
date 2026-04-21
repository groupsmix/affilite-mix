import type { AdPlacementRow, AdProvider } from "@/types/database";

/**
 * Default CPM rates by provider (USD per 1,000 impressions).
 *
 * Relocated from `app/admin/(dashboard)/ads/page.tsx` so the values can be
 * reused by any module that needs to estimate ad revenue (e.g. dashboards,
 * analytics pages). Values are unchanged from the previous inline definition.
 */
export const DEFAULT_CPM: Record<AdProvider, number> = {
  adsense: 2.5,
  carbon: 3.0,
  ethicalads: 2.0,
  custom: 1.5,
};

/**
 * Fallback CPM used when a placement has no provider-specific default and
 * no `est_cpm` override in its config. Matches the previous inline fallback.
 */
export const FALLBACK_CPM = 1.5;

/**
 * Resolve the effective CPM for an ad placement. Precedence is:
 *   1. `placement.config.est_cpm` (per-placement override)
 *   2. `DEFAULT_CPM[placement.provider]`
 *   3. `FALLBACK_CPM`
 */
export function resolveCpm(placement: Pick<AdPlacementRow, "provider" | "config">): number {
  const override = (placement.config as Record<string, number> | null)?.est_cpm;
  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }
  return DEFAULT_CPM[placement.provider] ?? FALLBACK_CPM;
}
