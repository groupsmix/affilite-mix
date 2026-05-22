/**
 * F-07/F-08: Feature flag registry with lifecycle metadata.
 *
 * Every feature flag must be registered here with owner, creation date,
 * planned expiry, blast radius, and rollback instructions. This replaces
 * ad-hoc boolean checks scattered across site configs and env vars.
 *
 * Access decisions are logged for telemetry and audit (F-08).
 */

import { logger } from "./logger";

export interface FeatureFlagDefinition {
  /** Human-readable name */
  name: string;
  /** Flag key (matches env var or site config property) */
  key: string;
  /** Team/person responsible for this flag */
  owner: string;
  /** ISO date when the flag was introduced */
  createdAt: string;
  /** ISO date by which the flag should be retired (null = permanent) */
  expiresAt: string | null;
  /** Which services/routes are affected when this flag changes */
  blastRadius: string;
  /** How to roll back if the flag causes issues */
  rollbackInstructions: string;
  /** Current rollout percentage (0-100) */
  rolloutPercent: number;
}

/**
 * Central registry of all feature flags.
 * Add new flags here; remove them when retired.
 */
export const FLAG_REGISTRY: FeatureFlagDefinition[] = [
  {
    name: "Cloudflare AI Provider",
    key: "AI_ENABLE_CLOUDFLARE",
    owner: "ai-team",
    createdAt: "2024-11-01",
    expiresAt: null,
    blastRadius: "AI content generation; topic suggestions",
    rollbackInstructions: "Set AI_ENABLE_CLOUDFLARE=false; traffic fails over to next provider",
    rolloutPercent: 100,
  },
  {
    name: "Google Gemini Provider",
    key: "AI_ENABLE_GEMINI",
    owner: "ai-team",
    createdAt: "2024-11-01",
    expiresAt: null,
    blastRadius: "AI content generation fallback",
    rollbackInstructions: "Set AI_ENABLE_GEMINI=false; traffic fails over to Groq/Cohere",
    rolloutPercent: 100,
  },
  {
    name: "Groq Provider",
    key: "AI_ENABLE_GROQ",
    owner: "ai-team",
    createdAt: "2024-11-01",
    expiresAt: null,
    blastRadius: "AI content generation fallback",
    rollbackInstructions: "Set AI_ENABLE_GROQ=false",
    rolloutPercent: 100,
  },
  {
    name: "Cohere Provider",
    key: "AI_ENABLE_COHERE",
    owner: "ai-team",
    createdAt: "2024-11-01",
    expiresAt: null,
    blastRadius: "AI content generation last-resort fallback",
    rollbackInstructions: "Set AI_ENABLE_COHERE=false",
    rolloutPercent: 100,
  },
  {
    name: "Gift Finder",
    key: "features.giftFinder",
    owner: "product-team",
    createdAt: "2024-10-15",
    expiresAt: null,
    blastRadius: "Public gift finder page and API endpoint",
    rollbackInstructions: "Set site config features.giftFinder=false",
    rolloutPercent: 100,
  },
  {
    name: "Rate Limit Force Closed",
    key: "RATE_LIMIT_FORCE_CLOSED",
    owner: "security-team",
    createdAt: "2025-01-01",
    expiresAt: null,
    blastRadius: "All rate-limited endpoints globally reject traffic",
    rollbackInstructions: "Unset RATE_LIMIT_FORCE_CLOSED or set to 'false'",
    rolloutPercent: 0,
  },
];

/**
 * Check a feature flag's value and log the access decision.
 * Used for telemetry/audit on flag evaluations.
 */
export function evaluateFlag(key: string, enabled: boolean, context?: Record<string, unknown>): boolean {
  logger.debug("Feature flag evaluated", {
    flag: key,
    enabled,
    ...context,
  });
  return enabled;
}

/**
 * Get all flags that have passed their expiry date.
 * Run in CI or startup to alert on stale flags.
 */
export function getExpiredFlags(): FeatureFlagDefinition[] {
  const now = new Date().toISOString();
  return FLAG_REGISTRY.filter((f) => f.expiresAt && f.expiresAt < now);
}
