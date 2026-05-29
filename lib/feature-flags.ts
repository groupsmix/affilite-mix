/**
 * F-07/F-08: Feature flag registry with lifecycle metadata.
 *
 * Every feature flag must be registered here with owner, creation date,
 * planned expiry, blast radius, and rollback instructions. This replaces
 * ad-hoc boolean checks scattered across site configs and env vars.
 *
 * POLICY: No permanent flags. Every flag MUST have a non-null expiresAt
 * date (max 180 days from createdAt). AI provider flags are configuration,
 * not feature flags — they belong in site config or env vars. Kill-switches
 * for incident response should use env vars, not this registry.
 *
 * Access decisions are logged for telemetry and audit (F-08).
 */

/** Maximum lifetime of a feature flag in days (6 months hard cap). */
export const MAX_FLAG_LIFETIME_DAYS = 180;

export interface FeatureFlagDefinition {
  /** Human-readable name */
  name: string;
  /** Flag key (matches env var or site config property) */
  key: string;
  /** Team/person responsible for this flag */
  owner: string;
  /** ISO date when the flag was introduced */
  createdAt: string;
  /**
   * ISO date by which the flag must be retired.
   * null is NOT allowed — every flag must expire. Use enforceNoPermanentFlags()
   * in CI to validate this invariant.
   */
  expiresAt: string;
  /** Which services/routes are affected when this flag changes */
  blastRadius: string;
  /** How to roll back if the flag causes issues */
  rollbackInstructions: string;
  /** Current rollout percentage (0-100) */
  rolloutPercent: number;
  /**
   * Ticket reference (e.g. "#1234") linking to the issue that will remove
   * this flag. Required for audit trail.
   */
  ticketRef: string;
}

/**
 * Central registry of all feature flags.
 * Add new flags here; remove them when retired.
 *
 * AI provider selections (Cloudflare, Gemini, Groq, Cohere) have been removed
 * from this registry — they are configuration, not temporary feature flags.
 * They belong in site config or env vars. See docs/feature-flags.md.
 *
 * RATE_LIMIT_FORCE_CLOSED is an incident-response kill-switch — it belongs
 * in an env var so it can be toggled without code deploy. See lib/rate-limit.ts.
 */
export const FLAG_REGISTRY: FeatureFlagDefinition[] = [
  {
    name: "Gift Finder",
    key: "features.giftFinder",
    owner: "product-team",
    createdAt: "2026-04-01",
    expiresAt: "2026-09-28", // 180 days from creation — within 180-day cap
    blastRadius: "Public gift finder page and API endpoint",
    rollbackInstructions: "Set site config features.giftFinder=false",
    rolloutPercent: 100,
    ticketRef: "#2345",
  },
  {
    name: "Login CAPTCHA (Turnstile)",
    key: "features.captchaOnLogin",
    owner: "security-team",
    createdAt: "2026-05-29",
    expiresAt: "2026-11-25", // 180 days — decide permanently by then
    blastRadius: "Admin login route (/api/auth/login)",
    rollbackInstructions:
      "Set features.captchaOnLogin=false in site config or set CAPTCHA_ON_LOGIN_DISABLED=true env var",
    rolloutPercent: 0, // Not yet enabled — tracking intent per A89-1
    ticketRef: "#567",
  },
];

/**
 * Get all flags that have passed their expiry date.
 * Run in CI or startup to alert on stale flags.
 */
export function getExpiredFlags(): FeatureFlagDefinition[] {
  const now = new Date().toISOString();
  return FLAG_REGISTRY.filter((f) => f.expiresAt < now);
}

/**
 * A90: Validate that no flag in the registry is permanent (expiresAt is null
 * or missing) and that every flag's lifetime does not exceed the max allowed.
 * Call this in CI to enforce the no-permanent-flags policy.
 *
 * @returns Array of validation error messages; empty array = all valid.
 */
export function validateFlagRegistry(): string[] {
  const errors: string[] = [];
  const now = new Date();

  for (const flag of FLAG_REGISTRY) {
    // Check expiresAt exists
    if (!flag.expiresAt) {
      errors.push(
        `Flag "${flag.key}" has no expiresAt. Every flag must have an expiry date (max ${MAX_FLAG_LIFETIME_DAYS} days from createdAt).`,
      );
      continue;
    }

    // Check createdAt <= expiresAt
    const created = new Date(flag.createdAt);
    const expires = new Date(flag.expiresAt);
    if (expires <= created) {
      errors.push(
        `Flag "${flag.key}" expiresAt (${flag.expiresAt}) must be after createdAt (${flag.createdAt}).`,
      );
      continue;
    }

    // Check lifetime within max cap
    const lifetimeDays = (expires.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (lifetimeDays > MAX_FLAG_LIFETIME_DAYS) {
      errors.push(
        `Flag "${flag.key}" lifetime (${Math.ceil(lifetimeDays)} days) exceeds ` +
          `maximum allowed (${MAX_FLAG_LIFETIME_DAYS} days). Shorten expiresAt or split into smaller flags.`,
      );
    }

    // Check expiresAt is in the future (not already expired at creation time)
    if (expires <= now) {
      errors.push(
        `Flag "${flag.key}" is already expired (expiresAt: ${flag.expiresAt}). ` +
          `Remove it from the registry or extend the expiry with a ticket reference.`,
      );
    }

    // Check ticket reference exists
    if (!flag.ticketRef) {
      errors.push(
        `Flag "${flag.key}" is missing ticketRef. Every flag must link to a removal ticket.`,
      );
    }
  }

  return errors;
}
