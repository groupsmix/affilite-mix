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
