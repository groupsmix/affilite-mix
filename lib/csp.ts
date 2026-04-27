/**
 * Content-Security-Policy helpers.
 *
 * H-10 (audit finding F42): inline `<style>` and `<script>` tags emitted by
 * the Next.js runtime or our own components (theme custom CSS, JSON-LD)
 * previously required `'unsafe-inline'` in `style-src` / `script-src`.
 * We now generate a per-request nonce in `middleware.ts` and apply it to
 * every inline element.
 *
 * A-11 (audit): we no longer ship `'unsafe-inline'` as a CSP Level-2
 * fallback. CSP Level-3 browsers ignore `'unsafe-inline'` once a nonce or
 * `'strict-dynamic'` is present anyway, but Level-2 browsers honour it
 * — keeping it around effectively neutralised the nonce hardening for
 * older Safari / Firefox versions and for any future engine that opts
 * out of Level-3. The nonce + `'strict-dynamic'` source is the canonical
 * modern recipe (see https://w3c.github.io/webappsec-csp/#strict-dynamic-usage).
 *
 * Rollout: the policy is shipped in **report-only** mode while
 * `CSP_REPORT_ONLY=true` (the default during the rollout window). The
 * existing `report-uri /api/csp-report` collector receives violation
 * reports without breaking the page. After a clean week of reports, set
 * `CSP_REPORT_ONLY=false` (or drop the env) to flip the same policy to
 * full enforcement.
 */

/**
 * Generate a cryptographically-random nonce suitable for use in CSP.
 * We use `crypto.getRandomValues` (Edge-runtime compatible) rather than
 * Node's Buffer API so the helper works in middleware.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // base64 — matches the format used by the Next.js CSP example.
  return btoa(binary);
}

/**
 * Build the Content-Security-Policy header value, embedding the given nonce
 * into `script-src` and `style-src`.
 *
 * Callers should set the same header on both the request (so Next.js picks
 * the nonce up for its own inline scripts) and the response (so the
 * browser actually enforces the policy).
 *
 * A-11: `'unsafe-inline'` is intentionally absent from `script-src` and
 * `style-src`. The nonce + `'strict-dynamic'` combination covers every
 * browser that implements CSP Level 3, and any inline `<script>` /
 * `<style>` we emit ourselves carries the matching nonce.
 */
export function buildCspHeader(nonce: string): string {
  const directives: string[] = [
    "default-src 'self'",
    // A-11: nonce-based allow-list for scripts. `'strict-dynamic'` lets
    // the nonced entry-point script load additional scripts, which is
    // required for Next.js' runtime chunks to execute. We no longer
    // append `'unsafe-inline'` — modern browsers ignore it when a nonce
    // is present anyway, and keeping it left a Level-2 escape hatch
    // open for older engines.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    // A-11: same nonce-only treatment for styles. Next.js and our
    // ThemeProvider already attach the nonce to every inline `<style>`.
    `style-src 'self' 'nonce-${nonce}'`,
    "font-src 'self'",
    "img-src 'self' data: blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.supabase.co https://images.unsplash.com https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://www.google.com",
    "connect-src 'self' https://*.supabase.co https://api.coingecko.com https://challenges.cloudflare.com https://*.ingest.sentry.io",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ];
  return directives.join("; ");
}

/**
 * Whether the CSP should be sent in report-only mode.
 *
 * A-11: defaults to **true** during the rollout window so violations
 * are surfaced via `report-uri` without breaking the page. Set
 * `CSP_REPORT_ONLY=false` (or `0` / `off`) to flip to full enforcement.
 */
export function isCspReportOnly(): boolean {
  const raw = process.env.CSP_REPORT_ONLY;
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

/**
 * The HTTP header name to use for the CSP, depending on whether
 * report-only mode is currently active. `Content-Security-Policy-Report-Only`
 * causes the browser to evaluate the policy and POST violations to the
 * configured `report-uri` without blocking any resource.
 */
export function cspHeaderName(): string {
  return isCspReportOnly() ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** Header name shared between middleware and server components. */
export const NONCE_HEADER = "x-nonce";
