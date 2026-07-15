import type { ApiSchemaName } from "@/lib/api-contract-schema";

/**
 * Route-by-route API metadata registry.
 *
 * Every Next.js Route Handler under `app/api/**` MUST have an entry here.
 * A test (`__tests__/api-routes-metadata.test.ts`) walks the filesystem and
 * fails when a new route is added without a corresponding registry entry.
 *
 * Rendered human-readable version lives in `docs/api-route-audit.md`.
 *
 * Source of truth: this file. Keep `docs/api-route-audit.md` in sync when the
 * registry changes (the test enforces the registry; the doc is for humans).
 */

type AuthRequirement =
  /** No authentication — public endpoint. */
  | "public"
  /** Cookie-based admin JWT required (`requireAdmin`). */
  | "admin"
  /** Admin JWT required AND `session.role === "super_admin"`. */
  | "super_admin"
  /** `Authorization: Bearer <CRON_SECRET>` or per-trigger cron secret. */
  | "cron"
  /** Internal Worker-to-Worker call; gated by `INTERNAL_API_SECRET`. */
  | "internal"
  /** Stripe-signed webhook (HMAC on raw body, no cookie auth). */
  | "stripe-webhook"
  /** Endpoint validates a signed single-use token instead of a session. */
  | "token"
  /** Machine automation: `Authorization: Bearer <automation-token>`, scoped
   *  to one site by the token's service account (no cookie, no CSRF). */
  | "automation";

type TenantScope =
  /** Scoped to the admin's active site (cookie + membership check). */
  | "site"
  /** Applies to the whole tenant / org. */
  | "tenant"
  /** Platform-wide endpoint (no tenant). */
  | "global";

export interface RouteMetadata {
  /** Route path as seen by Next.js (e.g. `/api/admin/products`). */
  path: string;
  /** HTTP methods exported by the handler. */
  methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD">;
  /** Authentication requirement. */
  auth: AuthRequirement;
  /** Does this route require the caller to be an admin? (derived but made explicit for clarity) */
  adminRequired: boolean;
  /** Tenant / site scoping semantics. */
  scope: TenantScope;
  /** Does the handler enforce rate limiting? */
  rateLimit: boolean;
  /** Does the handler enforce CSRF? (cookie-authenticated mutations must be true.) */
  csrf: boolean;
  /** Name of the request-body schema/parser, or null if the endpoint takes no body. */
  requestSchema: string | null;
  /** Name of the response schema, or a short description. */
  responseSchema: string | null;
  /** Fields that must be redacted from logs/audit entries (passwords, tokens, PII). */
  sensitiveFields: ReadonlyArray<string>;
  /** Machine-readable schemas for high-value routes included in generated OpenAPI. */
  contract?: {
    requestSchema?: ApiSchemaName;
    responses: Readonly<
      Record<
        string,
        {
          description: string;
          schema: ApiSchemaName;
        }
      >
    >;
  };
  /** Free-form notes. */
  notes?: string;
}

/**
 * Helper constants used throughout the registry below to reduce repetition.
 */
const ADMIN_DEFAULTS = {
  auth: "admin",
  adminRequired: true,
  scope: "site",
  rateLimit: true, // All admin routes go through `requireAdmin` which enforces 100 req/min.
  csrf: true,
} as const;

const CRON_DEFAULTS = {
  auth: "cron",
  adminRequired: false,
  scope: "tenant",
  rateLimit: false,
  csrf: false,
} as const;

// ---------------------------------------------------------------------------
// Registry.  Keep entries sorted by path for easier review.
// ---------------------------------------------------------------------------

export const API_ROUTE_METADATA: ReadonlyArray<RouteMetadata> = [
  // --- Admin routes ----------------------------------------------------------
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/ads",
    methods: ["GET", "POST"],
    requestSchema: "AdCreateInput",
    responseSchema: "Ad | Ad[]",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/ads/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    requestSchema: "AdUpdateInput",
    responseSchema: "Ad",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/affiliate-networks",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "AffiliateNetworkInput",
    responseSchema: "AffiliateNetwork",
    sensitiveFields: ["api_key", "secret"],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/ai-content",
    methods: ["POST"],
    requestSchema: "AiContentGenerateInput",
    responseSchema: "AiContentDraft",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/ai/rewrite",
    methods: ["POST"],
    requestSchema: "AiRewriteInput",
    responseSchema: "AiRewriteOutput",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "AnalyticsSnapshot",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics/conversion",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "ConversionFunnel",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics/domains",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "DomainPerformance",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics/products",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "TopProducts",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics/revenue",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "RevenueTrend",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/analytics/summary",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "AnalyticsSummary",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/api-tokens",
    methods: ["GET", "POST"],
    requestSchema: "AdminApiTokenInput",
    responseSchema: "AdminApiToken | AdminApiToken[]",
    sensitiveFields: ["token"],
    notes: "Creating API tokens is super_admin-only. The raw token is returned once on creation.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/api-tokens/[id]",
    methods: ["DELETE"],
    requestSchema: null,
    responseSchema: "{ ok: true }",
    sensitiveFields: [],
    notes: "Revoking an API token is super_admin-only.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/automation/service-accounts",
    methods: ["GET", "POST"],
    requestSchema: "AutomationServiceAccountInput",
    responseSchema: "AutomationServiceAccount | AutomationServiceAccount[]",
    sensitiveFields: ["plain_token", "token"],
    notes:
      "super_admin-only. Provisions a site-bound automation service account and issues its first bearer token (raw token returned once).",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/automation/service-accounts/[id]",
    methods: ["DELETE"],
    requestSchema: null,
    responseSchema: "{ ok: true }",
    sensitiveFields: [],
    notes: "super_admin-only kill switch: revokes an automation service account.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/audit-log/export",
    methods: ["GET"],
    requestSchema: "AuditLogQuery",
    responseSchema: "CSV",
    sensitiveFields: [],
    notes:
      "super_admin-only. Exports audit_log for the active site as CSV using the privileged client.",
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/categories",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "CategoryInput",
    responseSchema: "Category",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/categories/usage",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "CategoryUsage[]",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/content",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "ContentInput",
    responseSchema: "Content",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/content-products",
    methods: ["GET", "POST", "DELETE"],
    requestSchema: "ContentProductInput",
    responseSchema: "ContentProduct",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/content/clone",
    methods: ["POST"],
    requestSchema: "ContentCloneInput",
    responseSchema: "Content",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/content/share",
    methods: ["POST", "DELETE"],
    requestSchema: "ContentShareInput",
    responseSchema: "ContentShare",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/integrations",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "IntegrationInput",
    responseSchema: "Integration",
    sensitiveFields: ["api_key", "secret", "token", "webhook_secret"],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/media",
    methods: ["GET", "DELETE"],
    requestSchema: "MediaQuery | { id: string }",
    responseSchema: "Media[] | { ok: true }",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/modules",
    methods: ["GET", "PATCH"],
    requestSchema: "ModuleInput",
    responseSchema: "Module[]",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/pages",
    methods: ["GET", "POST"],
    requestSchema: "PageInput",
    responseSchema: "Page",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/pages/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    requestSchema: "PageInput",
    responseSchema: "Page",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/pages/reorder",
    methods: ["POST"],
    requestSchema: "PageReorderInput",
    responseSchema: "Ok",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/permissions",
    methods: ["GET", "POST", "DELETE"],
    requestSchema: "PermissionInput",
    responseSchema: "Permission",
    sensitiveFields: [],
    notes: "super_admin only — grants/revokes admin role + site membership.",
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/preview-token",
    methods: ["POST"],
    requestSchema: "PreviewTokenInput",
    responseSchema: "{ token: string }",
    sensitiveFields: ["token"],
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/privacy/user",
    methods: ["POST", "DELETE"],
    requestSchema: "PrivacyUserInput",
    responseSchema: "PrivacyExport | Ok",
    sensitiveFields: ["email", "ip", "data_export"],
    notes: "GDPR export/erasure — always audit-logged with ticket id in details.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/privacy/restrict",
    methods: ["POST", "DELETE"],
    requestSchema: "PrivacyRestrictInput",
    responseSchema: "Ok",
    sensitiveFields: ["email"],
    notes: "GDPR Art. 18 — place / lift processing restriction. Always audit-logged.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/privacy/rectify",
    methods: ["POST"],
    requestSchema: "PrivacyRectifyInput",
    responseSchema: "Ok",
    sensitiveFields: ["email", "new_email", "new_name"],
    notes: "S3-004: GDPR Art. 16 — rectify inaccurate personal data. Always audit-logged.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/privacy/object",
    methods: ["POST", "DELETE"],
    requestSchema: "PrivacyObjectInput",
    responseSchema: "Ok",
    sensitiveFields: ["email"],
    notes: "GDPR Art. 21 — record / withdraw marketing objection. Always audit-logged.",
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/dlq",
    methods: ["GET"],
    requestSchema: "void",
    responseSchema: "DlqDashboard",
    sensitiveFields: [],
    notes: "R-014: DLQ monitoring dashboard — shows recent webhook_dlq + click_failures entries.",
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/products",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "ProductInput",
    responseSchema: "Product",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/products/export",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "CSV stream",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/products/import",
    methods: ["POST"],
    requestSchema: "ProductImportInput (multipart CSV)",
    responseSchema: "{ imported: number; errors: ImportError[] }",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/presentations",
    methods: ["GET", "PUT", "POST"],
    requestSchema: "PresentationDraftInput",
    responseSchema: "{ published: Presentation | null; draft: Presentation | null }",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/schedule",
    methods: ["GET", "POST", "DELETE"],
    requestSchema: "ScheduleInput",
    responseSchema: "ScheduledJob",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites",
    methods: ["GET", "POST"],
    requestSchema: "SiteInput",
    responseSchema: "Site",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites/[id]",
    methods: ["GET", "PATCH", "DELETE"],
    requestSchema: "SiteInput",
    responseSchema: "Site",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites/active",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "{ siteId: string; slug: string }",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites/select",
    methods: ["POST"],
    requestSchema: "{ siteId: string }",
    responseSchema: "Ok",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites/stats",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "SiteStats",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/sites/templates",
    methods: ["GET"],
    requestSchema: null,
    responseSchema: "SiteTemplate[]",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/upload",
    methods: ["POST"],
    requestSchema: "UploadPresignInput",
    responseSchema:
      "{ uploadUrl: string; stagingKey: string; publicUrl: string; requiredHeaders: Record<string,string>; maxBytes: number }",
    sensitiveFields: ["uploadUrl"],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/upload/finalize",
    methods: ["POST"],
    requestSchema: "UploadFinalizeInput",
    responseSchema: "UploadedImage",
    sensitiveFields: [],
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/webhook-dlq",
    methods: ["GET", "PATCH"],
    requestSchema: "{ eventId: string }",
    responseSchema: "{ data: WebhookDlqEntry[]; count: number }",
    sensitiveFields: ["payload"],
  },
  {
    ...ADMIN_DEFAULTS,
    auth: "super_admin",
    path: "/api/admin/users",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    requestSchema: "AdminUserInput",
    responseSchema: "AdminUser",
    sensitiveFields: ["password", "password_hash", "totp_secret", "recovery_codes"],
    notes: "Creating/editing admin users is super_admin-only.",
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/users/me",
    methods: ["GET", "PATCH"],
    requestSchema: "AdminSelfInput",
    responseSchema: "AdminUser (self)",
    sensitiveFields: ["password_hash", "totp_secret"],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/users/me/password",
    methods: ["POST"],
    requestSchema: "{ currentPassword: string; newPassword: string }",
    responseSchema: "Ok",
    sensitiveFields: ["currentPassword", "newPassword"],
  },
  {
    ...ADMIN_DEFAULTS,
    path: "/api/admin/users/me/totp",
    methods: ["GET", "POST", "DELETE"],
    requestSchema: "TotpSetupInput",
    responseSchema: "{ secret?: string; qr?: string; enabled: boolean }",
    sensitiveFields: ["secret", "qr", "totp_token"],
  },

  // --- Auth routes ----------------------------------------------------------
  {
    path: "/api/auth/csrf",
    methods: ["GET"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: null,
    responseSchema: "{ csrfToken: string }",
    sensitiveFields: ["csrfToken"],
    contract: {
      responses: {
        "200": { description: "CSRF token issued", schema: "CsrfTokenResponse" },
        "429": { description: "Rate limited", schema: "ApiError" },
      },
    },
    notes: "Issues a double-submit CSRF token; sets an httpOnly cookie.",
  },
  {
    path: "/api/auth/forgot-password",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema: "{ email: string; turnstileToken: string }",
    responseSchema: "Ok (always 200 to avoid enumeration)",
    sensitiveFields: ["email"],
    notes: "Audit-logged as `request_password_reset`; throttled per IP + email.",
  },
  {
    path: "/api/auth/login",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema:
      "{ email: string; password: string; turnstileToken: string; totp_token?: string }",
    responseSchema: "{ user: AdminUser } + httpOnly session cookie",
    sensitiveFields: ["password", "totp_token"],
  },
  {
    path: "/api/auth/logout",
    methods: ["POST"],
    auth: "admin",
    adminRequired: true,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema: null,
    responseSchema: "Ok",
    sensitiveFields: [],
  },
  {
    path: "/api/auth/me",
    methods: ["GET"],
    auth: "admin",
    adminRequired: true,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: null,
    responseSchema: "AdminUser (self)",
    sensitiveFields: [],
    contract: {
      responses: {
        "200": { description: "Current admin session", schema: "AuthMeResponse" },
        "401": { description: "Not authenticated", schema: "ApiError" },
        "429": { description: "Rate limited", schema: "ApiError" },
      },
    },
  },
  {
    path: "/api/auth/refresh",
    methods: ["POST"],
    auth: "admin",
    adminRequired: true,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema: null,
    responseSchema: "{ expiresAt: string } + refreshed cookie",
    sensitiveFields: [],
  },
  {
    // F-030: step-up re-authentication. Re-verifies the current admin's
    // password (+ TOTP when 2FA is enabled) and re-mints the session cookie
    // with a fresh `step_up_at` claim so step-up-gated destructive operations
    // (site delete, user role change, user delete) can proceed.
    path: "/api/auth/step-up",
    methods: ["POST"],
    auth: "admin",
    adminRequired: true,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema: "{ password: string; totp_token?: string }",
    responseSchema: "{ ok: true } + re-minted session cookie",
    sensitiveFields: ["password", "totp_token"],
  },
  {
    path: "/api/auth/reset-password",
    methods: ["POST"],
    auth: "token",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: true,
    requestSchema: "{ token: string; newPassword: string }",
    responseSchema: "Ok",
    sensitiveFields: ["token", "newPassword"],
  },
  {
    path: "/api/auth/token-login",
    methods: ["POST"],
    auth: "token",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: "{ token: string }",
    responseSchema: "{ ok: true } + httpOnly session cookie",
    sensitiveFields: ["token"],
    notes:
      "Exchanges a pre-generated API token for an admin session. CSRF-exempt because the token is the auth factor.",
  },

  // --- Community routes -----------------------------------------------------
  {
    path: "/api/community/comments",
    methods: ["GET", "POST", "DELETE"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "CommentInput",
    responseSchema: "Comment",
    sensitiveFields: ["ip"],
  },
  {
    path: "/api/community/wrist-shots",
    methods: ["GET", "POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "WristShotInput",
    responseSchema: "WristShot",
    sensitiveFields: ["email", "ip"],
  },

  // --- Cron routes ----------------------------------------------------------
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/ai-generate",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ generated: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/click-reconcile",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ success_count: number; failure_count: number; alert: boolean }",
    sensitiveFields: [],
    notes: "A-006: Reconciles click tracking volume vs failures and alerts on threshold breach.",
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/commission-ingest",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ ingested: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/access-review",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ ok: boolean; totalUsers: number; findings: number }",
    sensitiveFields: ["email"],
    notes: "SOC 2 CC6.1 — automated access recertification.",
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/data-retention",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ purged: number; archived: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/epc-recompute",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ recomputed: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/expire-deals",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ expired: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/homepage-synthetic-check",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ ok: boolean; alerted: boolean }",
    sensitiveFields: [],
    notes:
      "Synthetic check: fail loudly when homepage renders empty while DB has published content.",
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/price-scrape",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ scraped: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/publish",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ published: number; archived: number }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/sitemap-refresh",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ pinged: string[] }",
    sensitiveFields: [],
  },
  {
    ...CRON_DEFAULTS,
    path: "/api/cron/stripe-sync",
    methods: ["POST"],
    requestSchema: null,
    responseSchema: "{ synced: number }",
    sensitiveFields: [],
  },

  // --- Public telemetry / health -------------------------------------------
  {
    path: "/api/csp-report",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: "CSPViolationReport",
    responseSchema: "204 No Content",
    sensitiveFields: ["ip"],
    notes: "Browser-generated CSP reports; body is untrusted.",
  },
  {
    path: "/api/gift-finder",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "GiftFinderInput",
    responseSchema: "GiftSuggestion[]",
    sensitiveFields: [],
  },
  {
    path: "/api/health",
    methods: ["GET"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: null,
    responseSchema: "{ status: string; checks: HealthCheck[] }",
    sensitiveFields: [],
    contract: {
      responses: {
        "200": { description: "Healthy service", schema: "HealthResponse" },
        "429": { description: "Rate limited", schema: "ApiError" },
        "503": { description: "Degraded service", schema: "HealthResponse" },
      },
    },
    notes: "Intentionally public so external uptime monitors can poll it.",
  },

  // --- Internal routes ------------------------------------------------------
  {
    path: "/api/internal/resolve-site",
    methods: ["GET"],
    auth: "internal",
    adminRequired: false,
    scope: "global",
    rateLimit: false,
    csrf: false,
    requestSchema: "{ host: string }",
    responseSchema: "{ siteId: string }",
    sensitiveFields: [],
    notes: "Worker-to-Worker only; gated by INTERNAL_API_SECRET.",
  },

  // --- Membership -----------------------------------------------------------
  {
    path: "/api/membership/checkout",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "CheckoutInput",
    responseSchema: "{ url: string }",
    sensitiveFields: ["email"],
  },
  {
    path: "/api/membership/webhook",
    methods: ["POST"],
    auth: "stripe-webhook",
    adminRequired: false,
    scope: "tenant",
    rateLimit: true,
    csrf: false,
    requestSchema: "Stripe.Event (raw)",
    responseSchema: "Ok",
    sensitiveFields: ["stripe-signature", "customer_email"],
    notes: "Signature-verified; no cookie auth / no CSRF.",
  },

  // --- Newsletter -----------------------------------------------------------
  {
    path: "/api/newsletter",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "{ email: string; turnstileToken: string }",
    responseSchema: "Ok",
    sensitiveFields: ["email"],
    contract: {
      requestSchema: "NewsletterSignupRequest",
      responses: {
        "200": { description: "Signup accepted", schema: "NewsletterSignupResponse" },
        "400": { description: "Invalid signup request", schema: "ApiError" },
        "403": { description: "Captcha verification failed", schema: "ApiError" },
        "429": { description: "Rate limited", schema: "ApiError" },
        "500": { description: "Signup failed", schema: "ApiError" },
        "503": { description: "Email service unavailable", schema: "ApiError" },
      },
    },
  },
  {
    path: "/api/newsletter/confirm",
    methods: ["GET"],
    auth: "token",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: "{ token: string }",
    responseSchema: "Ok",
    sensitiveFields: ["token"],
  },
  {
    path: "/api/newsletter/unsubscribe",
    methods: ["GET", "POST"],
    auth: "token",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: "{ token: string }",
    responseSchema: "Ok",
    sensitiveFields: ["token"],
  },

  // --- Product public APIs -------------------------------------------------
  {
    path: "/api/products/[productId]/price-alert",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "PriceAlertInput",
    responseSchema: "Ok",
    sensitiveFields: ["email"],
  },
  {
    path: "/api/products/[productId]/price-history",
    methods: ["GET"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: null,
    responseSchema: "PricePoint[]",
    sensitiveFields: [],
  },

  // --- Queue / revalidate --------------------------------------------------
  {
    path: "/api/queue/clicks",
    methods: ["POST"],
    auth: "internal",
    adminRequired: false,
    scope: "global",
    rateLimit: false,
    csrf: false,
    requestSchema: "ClickBatch",
    responseSchema: "{ enqueued: number }",
    sensitiveFields: ["ip", "user_agent"],
    notes: "Invoked by Cloudflare Queue consumer.",
  },
  {
    path: "/api/revalidate",
    methods: ["POST"],
    auth: "internal",
    adminRequired: false,
    scope: "global",
    rateLimit: false,
    csrf: false,
    requestSchema: "{ tag: string }",
    responseSchema: "Ok",
    sensitiveFields: [],
  },

  // --- Quiz -----------------------------------------------------------------
  {
    path: "/api/quiz/[slug]",
    methods: ["GET"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: null,
    responseSchema: "Quiz",
    sensitiveFields: [],
  },
  {
    path: "/api/quiz/[slug]/submit",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: true,
    requestSchema: "QuizSubmission",
    responseSchema: "QuizResult",
    sensitiveFields: ["email"],
  },

  // --- Tracking / vitals ---------------------------------------------------
  {
    path: "/api/track/click",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: "ClickEvent",
    responseSchema: "302 redirect",
    sensitiveFields: ["ip", "user_agent", "referer"],
  },
  {
    path: "/api/track/impression",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: "ImpressionEvent",
    responseSchema: "204 No Content",
    sensitiveFields: ["ip"],
  },
  {
    path: "/api/vitals",
    methods: ["POST"],
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    requestSchema: "WebVitalsReport",
    responseSchema: "204 No Content",
    sensitiveFields: [],
  },
  {
    auth: "public",
    adminRequired: false,
    scope: "global",
    rateLimit: true,
    csrf: false,
    path: "/api/consent/log",
    methods: ["POST"],
    requestSchema: "ConsentLogInput",
    responseSchema: "Ok",
    sensitiveFields: [],
    notes: "OF-04: Log consent banner acceptance. IP is truncated to /24 before storage.",
  },

  // --- User self-service ---------------------------------------------------
  {
    path: "/api/user/data-export",
    methods: ["GET"],
    auth: "public",
    adminRequired: false,
    scope: "site",
    rateLimit: true,
    csrf: false,
    requestSchema: "{ email: string }",
    responseSchema: "DataExportPayload",
    sensitiveFields: ["email"],
    notes: "S3-004: GDPR Art. 20 self-service data portability.",
  },

  // --- Automation control plane (machine-to-machine) -----------------------
  {
    path: "/api/automation/v1/health",
    methods: ["GET"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: null,
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization"],
    notes: "Authenticated liveness probe; returns the token's bound site.",
  },
  {
    path: "/api/automation/v1/context",
    methods: ["GET"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: null,
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization"],
    notes: "Requires scope site:read. Site identity, scopes, limits, counts, policies.",
  },
  {
    path: "/api/automation/v1/analytics/summary",
    methods: ["GET"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: null,
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization"],
    notes: "Requires scope analytics:read. Deterministic click/content/product summary.",
  },
  {
    path: "/api/automation/v1/content",
    methods: ["GET"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: null,
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization"],
    notes: "Requires scope content:read. Site-scoped content list with keyset pagination.",
  },
  {
    path: "/api/automation/v1/content/drafts",
    methods: ["POST"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: "AutomationDraftInput",
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization", "idempotency-key"],
    notes:
      "Requires scope content:draft. Idempotent (Idempotency-Key). Creates a pending AI draft via the durable action model; publishing stays approval-gated.",
  },
  {
    path: "/api/automation/v1/runs",
    methods: ["POST"],
    auth: "automation",
    adminRequired: false,
    scope: "site",
    rateLimit: false,
    csrf: false,
    requestSchema: "AutomationRunInput",
    responseSchema: "AutomationEnvelope",
    sensitiveFields: ["authorization"],
    notes: "Requires scope site:read. Opens a durable run grouping subsequent actions.",
  },
];

export const API_ROUTE_METADATA_BY_PATH: ReadonlyMap<string, RouteMetadata> = new Map(
  API_ROUTE_METADATA.map((m) => [m.path, m]),
);

/**
 * Derive the route path from a Next.js `route.ts` file path.
 *
 * Example: `app/api/admin/sites/[id]/route.ts` -> `/api/admin/sites/[id]`.
 */
export function routePathFromFile(filePath: string): string {
  // Normalize to forward slashes; strip anything before `app/`.
  const posix = filePath.replace(/\\/g, "/");
  const idx = posix.lastIndexOf("/app/");
  const relative = idx >= 0 ? posix.slice(idx + 1) : posix;
  if (!relative.startsWith("app/api/")) {
    throw new Error(`Not an app/api route: ${filePath}`);
  }
  // "app/api/foo/route.ts" -> "/api/foo"
  const withoutApp = relative.slice("app".length);
  const withoutRouteFile = withoutApp.replace(/\/route\.(ts|js|tsx|jsx)$/, "");
  return withoutRouteFile;
}
