/**
 * Shared utilities for CLI scripts.
 */

/**
 * Convert a kebab-case site ID to a camelCase variable name with "Site" suffix.
 * e.g. "coffee-gear" → "coffeeGearSite"
 */
export function toVarName(id: string): string {
  return id
    .split("-")
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("")
    .concat("Site");
}
