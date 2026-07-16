/**
 * Per-variant presentation defaults. These are the tasteful baseline for each
 * header design; site config and DB overrides layer on top. Kept as plain,
 * validated config (no CSS/JSX) so they flow through the same resolver as
 * untrusted input.
 */
import type { LayoutVariant } from "@/config/site-definition";
import type { HeaderConfig, HeaderTokens } from "@/config/presentation";

export const VARIANT_HEADER_DEFAULTS: Record<LayoutVariant, Partial<HeaderConfig>> = {
  standard: { navAlignment: "end" },
  compare: { showCta: true, navAlignment: "end" },
  magazine: { navAlignment: "center", logoMode: "wordmark" },
  minimal: { navAlignment: "end", showSearch: true },
  directory: { navAlignment: "start", categoryStrip: { enabled: true, items: [] } },
};

export const VARIANT_HEADER_TOKEN_DEFAULTS: Record<LayoutVariant, Partial<HeaderTokens>> = {
  standard: { appearance: "dark" },
  compare: { appearance: "dark" },
  magazine: { appearance: "light" },
  minimal: { appearance: "light" },
  directory: { appearance: "light" },
};
