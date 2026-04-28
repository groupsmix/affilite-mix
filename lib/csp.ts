/**
 * Content-Security-Policy helpers.
 *
 * H-10 (audit finding F42): inline `<style>` and `<script>` tags emitted by
 * the Next.js runtime or our own components (theme custom CSS, JSON-LD)
 * previously required `'unsafe-inline'` in `style-src` / `script-src`.
 * We now generate a per-request nonce in `middleware.ts` and apply it to
 * every inline element, letting us drop `'unsafe-inline'` from both
 * directives.  Old browsers that don't understand nonces will still honour
 * `'unsafe-inline'` which we keep as a CSP Level-2 fallback; CSP Level-3
 * browsers ignore `'unsafe-inline'` whenever a nonce or hash source is
 * present, so strict enforcement kicks in automatically.
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
 */
export function buildCspHeader(nonce: string): string {
  const directives: string[] = [
    "default-src 'self'",
    // A-011: Drop unsafe-inline from CSP. All inline scripts now carry the
    // per-request nonce generated in middleware.ts.  `'strict-dynamic'` lets
    // the nonced entry-point script load additional scripts (required for
    // Next.js runtime chunks).  No Level-2 fallback remains.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    // A-011: nonce-based allow-list for inline styles.  Next.js and
    // ThemeProvider inline `<style>` tags carry the per-request nonce.
    // F-017: CSP Level 1 fallback - 'unsafe-inline' is ignored by CSP Level 2+
    // browsers when nonce is present, but provides compatibility for older browsers.
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    // F-CD-02: Allow inline style="..." attributes (React components use them).
    // This is separate from style-src; CSP Level 3 browsers use this directive.
    `style-src-attr 'unsafe-inline'`,
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
 * F-017: Build a fallback CSP for very old browsers (IE11, old Safari).
 * This is used as a meta tag fallback when headers aren't supported.
 * Much more permissive but still blocks the worst attacks (XSS, clickjacking).
 */
export function buildLegacyCspMetaTag(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Header name shared between middleware and server components. */
export const NONCE_HEADER = "x-nonce";
