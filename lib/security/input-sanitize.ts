/**
 * A14: Centralized input sanitizer.
 *
 * Applies uniform canonicalization and safety transformations to user-supplied
 * text before it reaches business logic or the database:
 *
 *   1. NFC normalization — collapses homoglyphs and combining characters into
 *      their canonical composed form (e.g. "e\u0301" → "é").  Prevents
 *      unicode normalization attacks where two visually identical strings
 *      are stored as different byte sequences and bypass exact-match filters.
 *
 *   2. Null-byte stripping — removes U+0000 (null bytes) which can truncate
 *      C-style strings in downstream systems (PostgreSQL, nginx, shell) and
 *      lead to path/query truncation vulnerabilities.
 *
 *   3. Control-character stripping — removes C0 control characters (U+0001–U+001F
 *      except U+0009 TAB, U+000A LF, U+000D CR) and DEL (U+007F).  These
 *      characters are invisible but can break log parsing, HTML rendering,
 *      and CSV exports.
 *
 *   4. Length truncation — hard-truncates to the specified max to prevent
 *      memory and index bloat; the column-level constraint in the DB is the
 *      final authority, but truncating early prevents error disclosure.
 *
 * Usage:
 *   import { sanitizeText, sanitizeSlug } from "@/lib/security/input-sanitize";
 *   const cleanTitle = sanitizeText(rawTitle, { maxLength: 500 });
 */

export interface SanitizeOptions {
  /** Maximum allowed length in characters (Unicode code points). Default: 10_000 */
  maxLength?: number;
  /** If true, allow LF/CR (for multi-line fields). Default: true */
  allowNewlines?: boolean;
  /** If true, trim leading/trailing whitespace. Default: true */
  trim?: boolean;
}

/**
 * Sanitize a single text field value.
 * Returns the sanitized string or an empty string if input is nullish.
 */
export function sanitizeText(input: unknown, options: SanitizeOptions = {}): string {
  if (typeof input !== "string") return "";

  const { maxLength = 10_000, allowNewlines = true, trim = true } = options;

  // 1. NFC normalization
  let s = input.normalize("NFC");

  // 2. Null-byte removal (U+0000)
  s = s.replace(/\u0000/g, "");

  // 3. Control-character removal
  //    Keep TAB (U+0009), LF (U+000A), CR (U+000D) when allowNewlines=true.
  //    Strip DEL (U+007F) and C1 (U+0080–U+009F) always.
  if (allowNewlines) {
    // Strip C0 controls except TAB/LF/CR, strip DEL and C1

    s = s.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
  } else {
    // Strip all C0 controls, DEL, and C1

    s = s.replace(/[\u0001-\u001F\u007F-\u009F]/g, "");
  }

  // 4. Trim
  if (trim) {
    s = s.trim();
  }

  // 5. Hard length truncation (on Unicode code points, not UTF-16 code units)
  let codePointsCount = 0;
  let byteIndex = 0;
  for (const char of s) {
    if (codePointsCount >= maxLength) {
      s = s.slice(0, byteIndex);
      break;
    }
    byteIndex += char.length;
    codePointsCount++;
  }

  return s;
}

/**
 * Sanitize a slug / identifier field.
 * Enforces lowercase, allows only [a-z0-9-_].
 */
export function sanitizeSlug(input: unknown, maxLength = 255): string {
  const raw = sanitizeText(input, { maxLength, allowNewlines: false });
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Sanitize a URL/href field.
 * Returns null if the scheme is not http or https.
 */
export function sanitizeUrl(input: unknown, maxLength = 2048): string | null {
  const raw = sanitizeText(input, { maxLength, allowNewlines: false });
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    // fail-open: best-effort
    return null;
  }
}

/**
 * Sanitize an integer parameter (e.g. pagination limit).
 * Returns the clamped integer or the default if input is not a safe integer.
 */
export function sanitizeInt(
  input: unknown,
  {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    defaultValue = 0,
  }: { min?: number; max?: number; defaultValue?: number } = {},
): number {
  const n = Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return defaultValue;
  return Math.max(min, Math.min(max, n));
}
