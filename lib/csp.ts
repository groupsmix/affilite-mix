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
 *
 * G-03 / G-04 (Apr 2026 audit): previously we allowed `https://*.supabase.co`
 * and `https://*.r2.dev` — wildcards that would have let an attacker who
 * compromised any other Supabase project or any other R2 bucket inject
 * content into our pages. We now derive the exact Supabase subdomain from
 * `NEXT_PUBLIC_SUPABASE_URL` and the exact R2 public host from
 * `R2_PUBLIC_URL`. If either env var is missing (local dev/test without a
 * configured project) the corresponding origin is simply omitted from the
 * CSP. No wildcard string ever ships in the bundle.
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

function hostnameFromEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/**
 * Compute the exact allowed CSP origins for Supabase and R2 based on
 * env vars. Exported so `next.config.ts` and tests can use the same
 * resolution logic. Returns `null` when the env var is missing — callers
 * must omit the origin from the emitted directive rather than substitute
 * a wildcard. Production always resolves to exact origins because both
 * env vars are set via `wrangler secret` and checked in deploy.yml.
 */
export function getCspExternalHosts(): {
  supabase: string | null;
  r2: string | null;
} {
  const supabaseHost = hostnameFromEnv("NEXT_PUBLIC_SUPABASE_URL");
  const r2Host = hostnameFromEnv("R2_PUBLIC_URL");
  return {
    supabase: supabaseHost ? `https://${supabaseHost}` : null,
    r2: r2Host ? `https://${r2Host}` : null,
  };
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
  const { supabase, r2 } = getCspExternalHosts();
  // G-03 / G-04: build img-src and connect-src from the resolved host
  // list rather than interpolating wildcard-bearing strings. Supabase
  // and R2 origins are only included when their env var resolved to a
  // real hostname; no wildcard fallback ever ships.
  // G-48 (follow-up): third-party image CDNs (e.g. Amazon's media
  // CDNs) stay in img-src until the R2 ingest migration lands — see
  // the tracking issue.
  const imgSources = ["'self'", "data:", "blob:"];
  if (r2) imgSources.push(r2);
  if (supabase) imgSources.push(supabase);
  imgSources.push(
    "https://images.unsplash.com",
    "https://m.media-amazon.com",
    "https://images-na.ssl-images-amazon.com",
    "https://www.google.com",
  );

  const connectSources = ["'self'"];
  if (supabase) connectSources.push(supabase);
  connectSources.push("https://challenges.cloudflare.com", "https://*.ingest.sentry.io");

  const directives: string[] = [
    "default-src 'self'",
    // A-011: Drop unsafe-inline from CSP. All inline scripts now carry the
    // per-request nonce generated in middleware.ts.  `'strict-dynamic'` lets
    // the nonced entry-point script load additional scripts (required for
    // Next.js runtime chunks).  No Level-2 fallback remains.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    // A-011: nonce-based allow-list for inline styles.  Next.js and
    // ThemeProvider inline `<style>` tags carry the per-request nonce.
    `style-src 'self' 'nonce-${nonce}'`,
    "font-src 'self'",
    `img-src ${imgSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
    // F-024: report-uri is deprecated in CSP Level 3; modern browsers
    // use the Report-To HTTP header and the report-to CSP directive.
    "report-to default",
  ];
  return directives.join("; ");
}

/**
 * Build the Report-To header value for CSP reporting.
 * F-024: required by modern browsers instead of report-uri.
 */
export function buildReportToHeader(): string {
  return JSON.stringify({
    group: "default",
    max_age: 31536000,
    endpoints: [{ url: "/api/csp-report" }],
  });
}

/** Header name shared between middleware and server components. */
export const NONCE_HEADER = "x-nonce";
