import type { LayoutVariant } from "@/config/site-definition";

/**
 * Valid layout variants. Kept in sync with the LayoutVariant union in
 * config/site-definition.ts. Module-private on purpose so it stays a single
 * source of truth for the guard below without leaking an unused export.
 */
const VALID_LAYOUT_VARIANTS = new Set<string>([
  "standard",
  "compare",
  "magazine",
  "minimal",
  "directory",
]);

/**
 * Resolve the effective layout variant for a site.
 *
 * Precedence: a valid DB value wins, then the site-config value, then
 * "standard". A null / undefined / empty / unrecognized DB value falls through
 * to the site config instead of being coerced to "standard".
 *
 * The coercion bug this guards against: the public layout previously did
 * `(t?.layout_variant) || "standard"`, so a site whose `sites.theme` row had no
 * `layout_variant` key (none of them do — `toSiteRow` never wrote it) resolved
 * to the literal "standard", which then shadowed the site config's own
 * `layout` (e.g. AI Compared's "compare"). Every tenant rendered the standard
 * header/footer regardless of configuration.
 */
export function resolveLayoutVariant(
  dbValue: string | null | undefined,
  configValue: LayoutVariant | null | undefined,
): LayoutVariant {
  if (dbValue && VALID_LAYOUT_VARIANTS.has(dbValue)) {
    return dbValue as LayoutVariant;
  }
  if (configValue && VALID_LAYOUT_VARIANTS.has(configValue)) {
    return configValue;
  }
  return "standard";
}
