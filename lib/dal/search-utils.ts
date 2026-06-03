/** Escape LIKE/ILIKE special characters so user input is treated literally */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * T1-01: Strip PostgREST filter-tree metacharacters from user input before
 * interpolation into `.or()` / `.ilike()` strings. Without this, an attacker
 * can inject extra predicates via `,`, `(`, `)`, or `\`.
 *
 * Uses the same character set as `POSTGREST_UNSAFE` in `cursor-pagination.ts`.
 */
const POSTGREST_UNSAFE = /[,()\\]/g;
export function stripPostgrestMeta(value: string): string {
  return value.replace(POSTGREST_UNSAFE, "");
}

/**
 * Build a tsquery string from raw user input.
 * Splits on whitespace and joins with `&` (AND) so every term must match.
 * Each token is sanitised to prevent tsquery syntax errors.
 */
/** S0-P7-003: max number of tsquery tokens to prevent expensive queries. */
const MAX_TSQUERY_TOKENS = 15;

export function toTsquery(raw: string): string {
  // P-05: Cap input length to prevent O(n) processing on massive strings
  return raw
    .slice(0, 500)
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TSQUERY_TOKENS) // S0-P7-003: cap token count
    .map((t) => `${t}:*`) // prefix matching
    .join(" & ");
}
