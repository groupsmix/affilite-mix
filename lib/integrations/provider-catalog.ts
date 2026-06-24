/**
 * Static, app-defined integration provider catalog.
 *
 * This mirrors the built-in providers seeded by migration
 * `00028_platform_modules_permissions_integrations.sql` (the
 * `integration_providers` registry). It exists so the Integrations manager can
 * ALWAYS render the app-defined provider catalog — even when the DB registry is
 * momentarily empty / unseeded (e.g. the migration has not yet been applied to
 * the deployed environment) — instead of collapsing to a bare
 * "No integration providers available" empty state.
 *
 * The DB registry remains the source of truth when populated; this catalog is a
 * resilient fallback only. Keep it in sync with the migration seed.
 */

export interface StaticIntegrationProvider {
  /** Stable, app-defined provider key (matches the migration seed `key`). */
  key: string;
  name: string;
  category: string;
  description: string;
  is_builtin: boolean;
}

/**
 * The built-in integration providers, mirroring migration `00028`'s seed.
 * Ordered by category to match `listIntegrationProviders` (`ORDER BY category`).
 */
export const STATIC_INTEGRATION_PROVIDERS: readonly StaticIntegrationProvider[] = [
  // affiliate_network
  {
    key: "custom_affiliate",
    name: "Custom Affiliate Links",
    category: "affiliate_network",
    description: "Direct affiliate link management",
    is_builtin: true,
  },
  {
    key: "amazon_associates",
    name: "Amazon Associates",
    category: "affiliate_network",
    description: "Amazon affiliate program",
    is_builtin: true,
  },
  {
    key: "impact",
    name: "Impact",
    category: "affiliate_network",
    description: "Impact affiliate network",
    is_builtin: true,
  },
  {
    key: "cj",
    name: "Commission Junction",
    category: "affiliate_network",
    description: "CJ affiliate network",
    is_builtin: true,
  },
  {
    key: "shareasale",
    name: "ShareASale",
    category: "affiliate_network",
    description: "ShareASale affiliate network",
    is_builtin: true,
  },
  // analytics
  {
    key: "ga4",
    name: "Google Analytics 4",
    category: "analytics",
    description: "Google Analytics 4 tracking",
    is_builtin: true,
  },
  {
    key: "search_console",
    name: "Google Search Console",
    category: "analytics",
    description: "Google Search Console verification",
    is_builtin: true,
  },
  // email
  {
    key: "resend",
    name: "Resend",
    category: "email",
    description: "Transactional email via Resend",
    is_builtin: true,
  },
  {
    key: "mailchimp",
    name: "Mailchimp",
    category: "email",
    description: "Email marketing via Mailchimp",
    is_builtin: true,
  },
  {
    key: "brevo",
    name: "Brevo",
    category: "email",
    description: "Email marketing via Brevo (Sendinblue)",
    is_builtin: true,
  },
  {
    key: "convertkit",
    name: "ConvertKit",
    category: "email",
    description: "Creator email marketing via ConvertKit",
    is_builtin: true,
  },
  // storage
  {
    key: "cloudflare_r2",
    name: "Cloudflare R2",
    category: "storage",
    description: "Object storage via Cloudflare R2",
    is_builtin: true,
  },
  // bot_protection
  {
    key: "cloudflare_turnstile",
    name: "Cloudflare Turnstile",
    category: "bot_protection",
    description: "Bot protection via Cloudflare Turnstile",
    is_builtin: true,
  },
];
