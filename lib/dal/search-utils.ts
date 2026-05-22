/** Escape LIKE/ILIKE special characters so user input is treated literally */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Build a tsquery string from raw user input.
 * Splits on whitespace and joins with `&` (AND) so every term must match.
 * Each token is sanitised to prevent tsquery syntax errors.
 */
export function toTsquery(raw: string): string {
  // P-05: Cap input length to prevent O(n) processing on massive strings
  return raw
    .slice(0, 500)
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`) // prefix matching
    .join(" & ");
}
