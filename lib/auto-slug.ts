/**
 * Generate a URL-safe slug from a string, supporting Unicode characters
 * (Arabic, CJK, Cyrillic, etc.) in addition to Latin text.
 */
export function autoSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * M1-FIX: Generate a collision-resistant slug for database insertion.
 *
 * `autoSlug` alone produces the same output for duplicate titles (e.g.
 * "My Product" and "My Product" both yield "my-product"). When the
 * caller inserts without a uniqueness suffix the DB throws a unique
 * constraint violation that bubbles up as an unhandled 500.
 *
 * This variant appends a timestamp + short random suffix so collisions
 * are astronomically unlikely without needing a DB round-trip to check.
 * Use this wherever you need a slug that will be stored (content, products,
 * pages). Use the plain `autoSlug` only for display/preview purposes.
 *
 * @param value - The human-readable title/name to slugify
 * @param suffix - Optional explicit suffix (overrides the auto-generated one)
 */
export function autoSlugUnique(value: string, suffix?: string): string {
  const base = autoSlug(value);
  const tail = suffix ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return base ? `${base}-${tail}` : tail;
}
