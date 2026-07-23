/**
 * Pure, timezone-stable date formatter used by the content-card.
 *
 * Extracted from `app/(public)/components/content-card.tsx` so the formatting
 * logic can be exercised directly in tests and reused without rendering React.
 *
 * The card formats a publish/created timestamp via `toLocaleDateString` pinned
 * to the UTC time zone. Omitting `timeZone` would make server-rendered (UTC)
 * and client-rendered (browser TZ) output differ near midnight, producing a
 * React hydration mismatch. Pinning to "UTC" keeps the output identical on the
 * server and the client and invariant under the ambient/process time zone.
 *
 * Requirements: 16.2 (UTC + en-US default), 16.3 (hydration-stable output).
 */
export function formatCardDate(value: string | number | Date, locale = "en-US"): string {
  // site.locale uses OpenGraph-style underscores (e.g. en_US); Intl expects BCP 47 hyphens.
  const normalized = locale.replace(/_/g, "-") || "en-US";
  const date = new Date(value);
  try {
    return date.toLocaleDateString(normalized, {
      // Pin to UTC so SSR (UTC) and client (browser TZ) produce identical output.
      timeZone: "UTC",
    });
  } catch {
    return date.toLocaleDateString("en-US", { timeZone: "UTC" });
  }
}
