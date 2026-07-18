/**
 * Single source of truth for routes that are intentionally exempt from
 * the CSRF double-submit token check in `middleware.ts`.
 *
 * CSRF exemption is normal for webhooks, telemetry, queue consumers,
 * and cron, but every exempt route is now its own security boundary.
 * Adding an entry to this list MUST come with the documented
 * compensating controls below — and a security CODEOWNER review on the
 * pull request that introduces it.
 *
 * The middleware imports `csrfExemptPaths()` to build its in-memory
 * Set, and the registry test
 * (`__tests__/csrf-exempt-registry.test.ts`) asserts that:
 *
 *   1. Every entry has a non-empty `compensatingControls` block.
 *   2. Every entry has a security `owner` listed.
 *   3. The middleware Set matches the registry exactly (no drift).
 *
 * Cron routes are NOT listed here individually — they are exempted via
 * the prefix `/api/cron/` in middleware.ts, with each route's auth
 * coming from the central `lib/cron-registry.ts` (per-trigger Bearer
 * secret + CRON_SECRET fallback). The cron-registry test guarantees
 * every cron job sets `csrfExempt: true`.
 */

export interface CsrfExemptRoute {
  /** Absolute path relative to site root (e.g. `/api/track/click`). */
  readonly path: string;
  /** Why this route cannot use the standard CSRF double-submit. */
  readonly reason: string;
  /**
   * Compensating controls that replace the missing CSRF check. Each
   * entry should map to an actual code-level guard so an auditor can
   * trace the protection back to source.
   */
  readonly compensatingControls: readonly string[];
  /** Owning team responsible for the route. */
  readonly owner:
    | "@groupsmix/security"
    | "@groupsmix/platform"
    | "@groupsmix/data-platform"
    | "@groupsmix/engineering";
}

export const CSRF_EXEMPT_ROUTES: readonly CsrfExemptRoute[] = [
  {
    path: "/api/auth/csrf",
    reason: "CSRF token issuer — chicken-and-egg, must be reachable without a token.",
    compensatingControls: [
      "GET-only for the issuance endpoint; POST issuance requires a fresh session cookie.",
      "Rate-limited per-IP via lib/rate-limit (csrfTokenBucket).",
      "Tokens are one-shot and bound to the session identifier.",
    ],
    owner: "@groupsmix/security",
  },
  {
    path: "/api/auth/refresh",
    reason:
      "Background session keep-alive triggered by fetch; sameSite=Strict cookie covers fixation.",
    compensatingControls: [
      "Cookie is sameSite=Strict + httpOnly; cross-site fetches cannot send it.",
      "Refresh rate-limited via lib/rate-limit; abuse caps at session level.",
      "Refresh response does not echo the cookie value or token to the body.",
    ],
    owner: "@groupsmix/security",
  },
  {
    path: "/api/auth/token-login",
    reason: "API-token exchange endpoint used by Devin/automation; the token is the auth factor.",
    compensatingControls: [
      "High-entropy token (256 bits) is hashed (SHA-256) before DB lookup.",
      "Per-IP rate limit (10/min) and token expiry/revocation gate access.",
      "Response sets sameSite=Strict httpOnly cookies and returns no token in body.",
      "Audit log entry written per successful/failed exchange.",
    ],
    owner: "@groupsmix/security",
  },
  {
    path: "/api/membership/webhook",
    reason: "Stripe-signed webhook; CSRF cookies are never sent by Stripe.",
    compensatingControls: [
      "Stripe signature verification (HMAC-SHA256 over raw body) using STRIPE_WEBHOOK_SECRET.",
      "Idempotency key persisted in `stripe_events` with unique constraint to deduplicate replays.",
      "Schema-validated event payload before mutating membership state.",
    ],
    owner: "@groupsmix/data-platform",
  },
  {
    path: "/api/revalidate",
    reason: "Internal cache-purge endpoint called by background workers, not browsers.",
    compensatingControls: [
      "Bearer INTERNAL_API_TOKEN required (timing-safe comparison).",
      "Per-tag scoping — caller must specify both kind and site_id; no wildcard purge.",
      "Site list resolved server-side, attacker cannot inject arbitrary tags.",
      "Audit log entry written per purge call (see app/api/revalidate/route.ts).",
    ],
    owner: "@groupsmix/platform",
  },
  {
    path: "/api/track/click",
    reason: "Public sendBeacon() endpoint cannot send custom request headers.",
    compensatingControls: [
      "POST (sendBeacon) handler enforces Origin header validation against the per-site allow-list (isOriginAllowed — FRESH-03). GET (top-level link navigation) has no Origin by browser design and is intentionally permitted.",
      "Affiliate-domain allow-list validated at redirect time via validateAffiliateDomain() (T-09 / R-01) — rejects off-list destinations regardless of HTTP method.",
      "Per-IP rate-limit (lib/rate-limit clickBucket).",
      "KV-cached affiliate URL integrity verified with HMAC-SHA256 before redirect (P0-3 / CF-03).",
      "Click-id de-duplication via Postgres ON CONFLICT (click_id) DO NOTHING.",
    ],
    owner: "@groupsmix/engineering",
  },
  {
    path: "/api/vitals",
    reason: "Public sendBeacon() endpoint for web vitals; cannot carry custom headers.",
    compensatingControls: [
      "Origin header validation against the per-site allow-list (G-47, lib/security/allowed-origins.ts).",
      "Schema validation on the vitals payload; only known metric names accepted.",
      "Per-IP rate-limit (lib/rate-limit vitalsBucket).",
      "Body size capped at 4 KB to prevent bandwidth abuse.",
    ],
    owner: "@groupsmix/engineering",
  },
  {
    path: "/api/track/impression",
    reason: "Public sendBeacon() endpoint for ad-impression telemetry.",
    compensatingControls: [
      "Origin header validation against the per-site allow-list.",
      "Per-IP + per-site rate-limit (lib/rate-limit impressionBucket).",
      "RLS policy `public_insert_ad_impressions` requires an active parent site (migration 00067).",
    ],
    owner: "@groupsmix/engineering",
  },
  {
    path: "/api/csp-report",
    reason: "Browser-automated CSP violation report; UA cannot attach CSRF tokens.",
    compensatingControls: [
      "Body size capped at 64 KB; reports are stored append-only.",
      "Per-IP rate-limit (lib/rate-limit cspReportBucket).",
      "Reports are scrubbed to drop sensitive query/fragment data before persistence.",
    ],
    owner: "@groupsmix/security",
  },
  {
    path: "/api/queue/clicks",
    reason: "Cloudflare Queue consumer dispatched from the Worker, not a browser.",
    compensatingControls: [
      "Bearer INTERNAL_API_TOKEN required (timing-safe comparison).",
      "Privileged Supabase client used by design (see F-002 deep-audit notes).",
      "Per-message validation (length-bounded fields, batch size capped) — see F-014.",
      "DLQ persistence to `click_failures` for any malformed batch.",
    ],
    owner: "@groupsmix/platform",
  },
  {
    path: "/api/newsletter/unsubscribe",
    reason: "One-click unsubscribe link; the per-subscriber unsubscribe_token IS the auth factor.",
    compensatingControls: [
      "Each subscriber has a cryptographically random `unsubscribe_token`.",
      "GET uses query param, POST requires the token in the body — both validated server-side.",
      "Token is single-purpose: it can only revoke the subscriber's own row.",
      "Audit log entry written per unsubscribe.",
    ],
    owner: "@groupsmix/engineering",
  },
  {
    path: "/api/automation/",
    reason:
      "Automation API uses Bearer token authentication and is invoked by non-browser machine callers, not by form submissions that require double-submit CSRF protection.",
    compensatingControls: [
      "Bearer token verified in lib/automation/auth.ts (SHA-256 hash lookup, expiry and status checks).",
      "Token is bound to a specific site_id; route handlers cannot widen access to another tenant.",
      "Per-route rate limiting via lib/rate-limit (automation bucket).",
      "State-changing automation actions require idempotency-key header and are logged in automation_runs.",
    ],
    owner: "@groupsmix/security",
  },
] as const;

const csrfExemptSet = new Set<string>(CSRF_EXEMPT_ROUTES.map((r) => r.path));

/** Path-only set used by middleware.ts for the O(1) exemption lookup. */
export function csrfExemptPaths(): ReadonlySet<string> {
  return csrfExemptSet;
}
