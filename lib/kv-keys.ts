/**
 * A100-07: Centralized KV key-builder utility.
 *
 * All KV key construction goes through this module so that:
 * 1. Key format invariants are enforced in one place.
 * 2. Future input sanitization changes only need one update.
 * 3. Key collisions between subsystems are impossible by design.
 *
 * Keys are prefixed by subsystem to create implicit namespacing.
 */

/** Validate that a slug conforms to the expected pattern. */
function assertSafeSlug(value: string, label: string): void {
  if (!value || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value)) {
    throw new Error(`[kv-keys] Invalid ${label}: "${value}" does not match slug pattern`);
  }
}

/** Validate a hostname-like value (no colons, no slashes, no spaces). */
function assertSafeDomain(value: string): void {
  if (!value || /[\s/\\:]/.test(value) || value.length > 253) {
    throw new Error(`[kv-keys] Invalid domain: "${value}"`);
  }
}

// ── Site resolution keys ──────────────────────────────────────────

export function siteDomainKey(hostname: string): string {
  assertSafeDomain(hostname);
  return `site-domain:${hostname}`;
}

export function siteDomainMissKey(hostname: string): string {
  assertSafeDomain(hostname);
  return `site-domain-miss:${hostname}`;
}

export function siteSlugKey(slug: string): string {
  assertSafeSlug(slug, "site slug");
  return `admin-guard:site-slug:${slug}`;
}

// ── Rate limit keys ───────────────────────────────────────────────

export function hostnameResolveLimitKey(ip: string): string {
  return `hostname-resolve:${ip}`;
}

export function loginIpKey(ip: string): string {
  return `login:${ip}`;
}

export function loginEmailKey(hashedEmail: string): string {
  return `login-email:${hashedEmail}`;
}

export function loginTotpKey(hashedEmail: string): string {
  return `login-totp:${hashedEmail}`;
}

export function unsubscribeKey(ip: string): string {
  return `unsub:${ip}`;
}

export function consentLogKey(ip: string): string {
  return `consent-log:${ip}`;
}

// ── Maintenance & system keys ─────────────────────────────────────

export const MAINTENANCE_MODE_KEY = "maintenance_mode";
