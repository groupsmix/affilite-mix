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
    binary += String.fromCharCode(bytes[i]!);
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
    // fail-open: best-effort [criticality:non-critical]
    return null;
  }
}

/**
 * Resolve the exact Sentry ingest host from the configured DSN. Mirrors
 * the G-03 / G-04 pattern for Supabase and R2: an exact `https://<host>`
 * origin replaces the previous `https://*.ingest.sentry.io` wildcard so
 * that a compromised sibling Sentry org/project cannot serve as a CSP
 * exfiltration channel. Returns an empty string when no DSN is configured
 * (local dev/test) so the caller omits Sentry from connect-src entirely,
 * matching the G-03/G-04 pattern for Supabase and R2. Production builds
 * always have the DSN set via `wrangler secret`.
 */
function getSentryConnectHost(): string {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  if (dsn) {
    try {
      const host = new URL(dsn).hostname;
      if (host && host.endsWith(".sentry.io")) {
        return `https://${host}`;
      }
    } catch {
      // malformed DSN — omit Sentry from CSP rather than widening it
    }
  }
  // F-10: omit Sentry from connect-src when no DSN is configured rather
  // than falling back to a wildcard that would allow any Sentry org as
  // a CSP exfiltration channel. Production builds always have the DSN
  // set via wrangler secret; this path only fires in local dev/test.
  return "";
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
  r2Upload: string | null;
} {
  const supabaseHost = hostnameFromEnv("NEXT_PUBLIC_SUPABASE_URL");
  const r2Host = hostnameFromEnv("R2_PUBLIC_URL");
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  return {
    supabase: supabaseHost ? `https://${supabaseHost}` : null,
    r2: r2Host ? `https://${r2Host}` : null,
    r2Upload: r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : null,
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
  const { supabase, r2, r2Upload } = getCspExternalHosts();
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
  // audit5-#30: img-src is the single source of truth for the
  // browser; `next.config.ts:images.remotePatterns` is the single
  // source of truth for the `<Image>` loader. They MUST stay in sync
  // or content editors get confusing rejections (pastes load via
  // <img> but not via Next.js <Image>). Two prior allowlists drifted:
  //   * `images.unsplash.com` — only ever referenced in csp.ts; no
  //     code path embeds an unsplash URL anywhere. Removed.
  //   * `www.google.com` — used by `lib/sitemap-ping.ts` for the
  //     /ping?sitemap=… endpoint, a server-side fetch (subject to
  //     connect-src in the worker, not img-src in the browser).
  //     Removed from img-src; sitemap pinging is unaffected.
  // Amazon media CDNs stay in both lists; they're referenced by
  // existing product image_url rows and will migrate to R2 ingest
  // per G-48 follow-up.
  imgSources.push("https://m.media-amazon.com", "https://images-na.ssl-images-amazon.com");

  const connectSources = ["'self'"];
  if (supabase) connectSources.push(supabase);
  if (r2Upload) connectSources.push(r2Upload);
  connectSources.push("https://challenges.cloudflare.com");
  const sentryHost = getSentryConnectHost();
  if (sentryHost) connectSources.push(sentryHost);

  const directives: string[] = [
    "default-src 'self'",
    // A-011: Drop unsafe-inline from CSP. All inline scripts now carry the
    // per-request nonce generated in middleware.ts.  `'strict-dynamic'` lets
    // the nonced entry-point script load additional scripts (required for
    // Next.js runtime chunks).  No Level-2 fallback remains.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    // ACCEPTED-RISK (A68/A106/SEC-07 style-src unsafe-inline):
    // CSP nonces only protect <style> elements, not style *attributes*
    // (ThemeProvider CSS-var injection, component inline backgrounds).
    // Chromium blocks dynamic element.style assignments against nonce-
    // locked style-src, breaking vanilla-cookieconsent and React hydration.
    // Since the critical XSS vector (script injection) is nonce-locked
    // via script-src, allowing 'unsafe-inline' for styles is the standard
    // security posture adopted by most production CSPs.
    // COMPENSATING CONTROL: lib/sanitize-html.ts strips style attributes
    // from all user-authored content, preventing CSS injection/exfil.
    // F-20: REVISIT: 2026-09-01 — check if vanilla-cookieconsent v3 supports
    // nonced styles; if so, replace 'unsafe-inline' with nonce-based style-src.
    // Tracked via the F-20 milestone; open a GitHub issue and reference it here
    // when the upstream library ships nonce support.

    //
    // F-07: Cannot remove 'unsafe-inline' at this time due to technical
    // limitations with vanilla-cookieconsent and React hydration. The
    // compensating control (sanitize-html.ts) mitigates the XSS risk by
    // stripping style attributes from user content. This is tracked for
    // future resolution in F-20.
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    // A11Y-CONTRAST-2026-06-15: style-src above carries a nonce, so CSP
    // Level-3 browsers (Chromium) IGNORE its 'unsafe-inline' — which silently
    // blocks inline `style` *attributes* (e.g. the per-site theming
    // `style={{ backgroundColor: site.theme.primaryColor }}` on hero
    // sections). With the background dropped, hero text rendered on the white
    // page body and failed WCAG AA contrast (axe). style-src-attr has no
    // nonce, so 'unsafe-inline' is honoured here and inline style attributes
    // (and dynamic element.style writes) work again. Nonce protection on
    // <style> elements via style-src is unaffected.
    "style-src-attr 'unsafe-inline'",
    // style-src-elem: same rationale as style-src-attr above. When style-src
    // carries a nonce, CSP Level-3 browsers ignore its 'unsafe-inline' and
    // the style-src-elem fallback inherits that restriction — silently
    // blocking <style> elements injected by Next.js (styled-jsx) and React
    // that don't carry the nonce. Setting style-src-elem explicitly without
    // a nonce ensures 'unsafe-inline' is honoured for <style> elements.
    "style-src-elem 'self' 'unsafe-inline'",
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
    // audit5-#8: BOTH `report-uri` and `report-to` are intentionally
    // emitted together — they are NOT redundant in practice:
    //
    //   * Firefox (Gecko) only honours `report-uri`, not `report-to`.
    //   * Chromium ignores `report-uri` if `report-to` is also present.
    //   * Safari (16+) honours `report-to`.
    //
    // Removing either directive drops one browser family's reports
    // entirely. Both endpoints currently point at the same handler;
    // if duplicate reports start exhausting the per-IP rate limit on
    // `/api/csp-report` during a real attack, split into
    // `/api/csp-report-rfc` (report-to) and `/api/csp-report-legacy`
    // (report-uri) so each browser family has its own bucket. The
    // previous comment claimed `report-uri` was deprecated and could
    // be removed; that is incorrect for Firefox support and has now
    // been corrected.
    "report-uri /api/csp-report",
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

/**
 * Build the Reporting-Endpoints header (CSP Level 3 / Reporting API v1).
 * Chrome 96+ and Edge 96+ use this instead of the legacy Report-To header.
 * ETAP1-24: emitted alongside Report-To for cross-browser coverage.
 */
export function buildReportingEndpointsHeader(): string {
  return 'default="/api/csp-report"';
}

/** Header name shared between middleware and server components. */
export const NONCE_HEADER = "x-nonce";
