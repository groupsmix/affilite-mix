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
    // H-10: nonce-based allow-list for scripts.  `'strict-dynamic'` lets the
    // nonced entry-point script load additional scripts, which is required
    // for Next.js' runtime chunks to execute.  `'unsafe-inline'` is retained
    // as a CSP Level-2 fallback — CSP Level-3 browsers ignore it when a
    // nonce is present.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https://challenges.cloudflare.com`,
    // H-10: nonce-based allow-list for inline styles.  Next.js and our
    // ThemeProvider still emit some inline `<style>` tags; they now carry
    // the nonce, so `'unsafe-inline'` is only kept as a Level-2 fallback
    // (ignored by browsers that honour the nonce).
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.coingecko.com https://challenges.cloudflare.com https://*.ingest.sentry.io",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

/** Header name shared between middleware and server components. */
export const NONCE_HEADER = "x-nonce";
