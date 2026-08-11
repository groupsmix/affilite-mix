/**
 * Per-click commission attribution.
 *
 * Outbound affiliate links carry the site's network tracking key (CJ `sid`,
 * Awin `clickref`, …), which is enough to map an ingested commission report to
 * a site but not to the click that produced it — so `commissions.product_id`
 * and `commissions.click_id` were never populated and per-product EPC stayed
 * at zero.
 *
 * The redirect appends an opaque per-click reference to that same key:
 *
 *   clickref=wristnerd42-r9f3c1a7b2e5d0846
 *            └ site key ┘└ click reference ┘
 *
 * Ingestion splits the suffix off, resolves the site from the prefix exactly
 * as before, and resolves the click from the suffix. The reference is only ever
 * a lookup key into our own `affiliate_clicks` table, and a third party cannot
 * fabricate a commission report, so it is not signed — but it is random so it
 * cannot be enumerated to shift attribution between products.
 */

const CLICK_REF_HEX_LENGTH = 16;
const CLICK_REF_MARKER = "-r";
const CLICK_REF_RE = new RegExp(`^(.+)-r([0-9a-f]{${CLICK_REF_HEX_LENGTH}})$`);

/**
 * Networks cap the tracking value; CJ's `sid` is the tightest at 64
 * characters. A site key long enough to leave no room simply keeps its
 * unattributed link rather than shipping a value the network will truncate.
 */
export const MAX_TRACKING_VALUE_LENGTH = 64;

/** Length of the reference on its own, without the marker. */
export const CLICK_REF_LENGTH = CLICK_REF_HEX_LENGTH;

/** Generate an opaque, non-enumerable click reference. */
export function generateClickRef(): string {
  const bytes = new Uint8Array(CLICK_REF_HEX_LENGTH / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True for a syntactically valid reference (as stored and as parsed back). */
export function isValidClickRef(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${CLICK_REF_HEX_LENGTH}}$`).test(value);
}

/**
 * Append a click reference to a site tracking key.
 *
 * Returns null when the combined value would exceed what networks accept, so
 * the caller keeps the plain site key and site-level attribution.
 */
export function withClickRef(trackingKey: string, clickRef: string): string | null {
  if (trackingKey === "" || !isValidClickRef(clickRef)) return null;
  const combined = `${trackingKey}${CLICK_REF_MARKER}${clickRef}`;
  return combined.length > MAX_TRACKING_VALUE_LENGTH ? null : combined;
}

export interface ParsedTrackingValue {
  /** The site tracking key to resolve the tenant with. */
  trackingKey: string;
  /** The click reference, when the value carries one. */
  clickRef: string | null;
}

/**
 * Split a reported tracking value back into site key and click reference.
 *
 * A value produced before this contract existed — or by a network that
 * rewrote it — yields the whole value as the tracking key and a null
 * reference, which is exactly the previous behaviour.
 */
export function parseTrackingValue(value: string): ParsedTrackingValue {
  // Networks with a dedicated sub-id parameter (Amazon `ascsubtag`) carry the
  // reference alone; the site is then read off the resolved click.
  if (isValidClickRef(value)) return { trackingKey: "", clickRef: value };
  const match = CLICK_REF_RE.exec(value);
  if (!match) return { trackingKey: value, clickRef: null };
  return { trackingKey: match[1]!, clickRef: match[2]! };
}
