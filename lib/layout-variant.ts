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
  return firstValidVariant(dbValue, configValue);
}

/** True when `value` is one of the recognized layout variants. */
export function isValidVariant(value: unknown): value is LayoutVariant {
  return typeof value === "string" && VALID_LAYOUT_VARIANTS.has(value);
}

/** Return the first recognized variant among the candidates, else "standard". */
export function firstValidVariant(...candidates: (string | null | undefined)[]): LayoutVariant {
  for (const candidate of candidates) {
    if (candidate && VALID_LAYOUT_VARIANTS.has(candidate)) {
      return candidate as LayoutVariant;
    }
  }
  return "standard";
}

/**
 * Resolve the header variant independently of the footer. Precedence:
 * DB header override → DB shared layout → config header override → config
 * shared layout → "standard". This lets a site (or the dashboard/AI) change
 * the header design without also changing the footer, which the single
 * `layoutVariant` field could not express.
 */
export function resolveHeaderVariant(input: {
  dbHeaderVariant?: string | null;
  dbLayoutVariant?: string | null;
  configHeaderVariant?: LayoutVariant | null;
  configLayoutVariant?: LayoutVariant | null;
}): LayoutVariant {
  return firstValidVariant(
    input.dbHeaderVariant,
    input.dbLayoutVariant,
    input.configHeaderVariant,
    input.configLayoutVariant,
  );
}

/** Footer counterpart of {@link resolveHeaderVariant}. */
export function resolveFooterVariant(input: {
  dbFooterVariant?: string | null;
  dbLayoutVariant?: string | null;
  configFooterVariant?: LayoutVariant | null;
  configLayoutVariant?: LayoutVariant | null;
}): LayoutVariant {
  return firstValidVariant(
    input.dbFooterVariant,
    input.dbLayoutVariant,
    input.configFooterVariant,
    input.configLayoutVariant,
  );
}
