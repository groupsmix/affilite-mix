/**
 * Canonical "live" feature keys that the runtime actually gates on via
 * `site.features.*` (resolved in lib/site-context.ts). These are the flags a
 * dashboard toggle can genuinely turn on/off for a site.
 *
 * The dashboard Feature Flags page used to write to the `site_feature_flags`
 * table, which nothing read at runtime — so toggles had no effect ("fake").
 * Live features below are now stored in `sites.features` (the column the
 * runtime already reads), so toggling them takes effect after cache
 * revalidation. Any other (custom) flag key is still stored in
 * `site_feature_flags` for a team's own code to read.
 *
 * NOTE: `blog` is intentionally excluded — it is object-typed
 * (`{ source: "database" }`) rather than a plain boolean. `captchaOnLogin`
 * and login rate-limit kill-switches are intentionally excluded too — they
 * are security controls driven by env vars / the FLAG_REGISTRY governance
 * list in lib/feature-flags.ts, not per-site dashboard toggles.
 */

export interface KnownFeature {
  /** Canonical key as stored in `sites.features` and checked as `site.features[key]`. */
  key: string;
  label: string;
  description: string;
  /** Default value shown in the dashboard when the site has no explicit override. */
  defaultEnabled: boolean;
}

export const KNOWN_FEATURES: readonly KnownFeature[] = [
  {
    key: "newsletter",
    label: "Newsletter",
    description: "Email signup and subscriber management.",
    defaultEnabled: true,
  },
  {
    key: "searchModal",
    label: "Search",
    description: "Full-text search modal.",
    defaultEnabled: true,
  },
  {
    key: "giftFinder",
    label: "Gift Finder",
    description: "Interactive gift recommendation quiz and its public page/API.",
    defaultEnabled: false,
  },
  {
    key: "comparisons",
    label: "Comparisons",
    description: "Product comparison tables.",
    defaultEnabled: false,
  },
  {
    key: "deals",
    label: "Deals",
    description: "Deal badges and expiring offers.",
    defaultEnabled: false,
  },
  {
    key: "brandSpotlights",
    label: "Brand Spotlights",
    description: "Dedicated brand pages.",
    defaultEnabled: false,
  },
  {
    key: "rssFeed",
    label: "RSS Feed",
    description: "Auto-generated RSS/Atom feed.",
    defaultEnabled: false,
  },
  {
    key: "scheduling",
    label: "Scheduling",
    description: "Scheduled publish/archive for content.",
    defaultEnabled: true,
  },
  {
    key: "cookieConsent",
    label: "Cookie Consent",
    description: "GDPR/CCPA cookie consent banner.",
    defaultEnabled: true,
  },
  {
    key: "taxonomyPages",
    label: "Taxonomy Pages",
    description: "Budget, occasion, and recipient browse pages.",
    defaultEnabled: false,
  },
] as const;

/** Set of canonical live-feature keys, for O(1) membership checks. */
export const KNOWN_FEATURE_KEYS: ReadonlySet<string> = new Set(KNOWN_FEATURES.map((f) => f.key));

/**
 * Normalise a stored flag key to the canonical `sites.features` key.
 * Tolerates the `features.` prefix used by the governance registry
 * (lib/feature-flags.ts), e.g. "features.giftFinder" -> "giftFinder".
 */
export function normalizeFlagKey(flagKey: string): string {
  return flagKey.startsWith("features.") ? flagKey.slice("features.".length) : flagKey;
}

/** True when the (normalised) key maps to a runtime-gated live feature. */
export function isKnownFeatureKey(flagKey: string): boolean {
  return KNOWN_FEATURE_KEYS.has(normalizeFlagKey(flagKey));
}

/**
 * Overlay explicit boolean overrides from a site's `features` jsonb column onto
 * a base feature map.
 *
 * STRICTLY ADDITIVE: only keys present as a real boolean in `overrides` are
 * applied. When `overrides` is null/empty, the returned map is identical to
 * `base` — so runtime behaviour is unchanged for any site that has not set an
 * explicit flag. This is what makes wiring the flags into the hot path safe.
 */
export function applyFeatureOverrides<T extends object>(
  base: T,
  overrides: Record<string, unknown> | null | undefined,
): T {
  if (!overrides) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of KNOWN_FEATURE_KEYS) {
    const value = overrides[key];
    if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out as T;
}
