/**
 * Automation scopes — the granular capabilities a machine service account
 * may hold. Scopes are stored on `automation_service_accounts.scopes` and
 * checked by the automation API gateway before any handler runs.
 *
 * A scope is NEVER chosen by model text or request input; it is a fixed
 * property of the authenticated service account.
 */

export const READ_SCOPES = [
  "site:read",
  "analytics:read",
  "content:read",
  "products:read",
  "affiliate:status",
  "jobs:read",
  "audit:read-own",
] as const;

export const MUTATION_SCOPES = [
  "content:draft",
  "content:update",
  "content:schedule",
  "content:publish",
  "products:update",
  "products:activate",
  "jobs:trigger",
] as const;

/**
 * Scopes that are intentionally NOT grantable through this control plane.
 * Destructive / configuration authority stays owner-only (see plan §5.2).
 */
export const FORBIDDEN_SCOPES = [
  "content:delete",
  "products:delete",
  "integrations:configure",
  "sites:write",
  "users:write",
  "secrets:write",
] as const;

export type ReadScope = (typeof READ_SCOPES)[number];
export type MutationScope = (typeof MUTATION_SCOPES)[number];
export type AutomationScope = ReadScope | MutationScope;

export const GRANTABLE_SCOPES: readonly AutomationScope[] = [...READ_SCOPES, ...MUTATION_SCOPES];

const GRANTABLE_SET = new Set<string>(GRANTABLE_SCOPES);
const FORBIDDEN_SET = new Set<string>(FORBIDDEN_SCOPES);

/** True when `scope` is a known, grantable automation scope. */
export function isGrantableScope(scope: string): scope is AutomationScope {
  return GRANTABLE_SET.has(scope);
}

/** True when `scope` is explicitly forbidden from ever being granted. */
export function isForbiddenScope(scope: string): boolean {
  return FORBIDDEN_SET.has(scope);
}

/**
 * True when the set of `held` scopes includes `required`. Unknown /
 * forbidden scopes are ignored so a corrupt row cannot widen access.
 */
export function hasScope(held: readonly string[], required: AutomationScope): boolean {
  return held.includes(required);
}

/**
 * Validate a requested scope list at grant time. Returns the sanitised
 * (deduped, ordered) list or throws with the first offending scope.
 */
export function assertGrantableScopes(requested: readonly string[]): AutomationScope[] {
  const out: AutomationScope[] = [];
  for (const scope of requested) {
    if (isForbiddenScope(scope)) {
      throw new Error(`Scope "${scope}" is owner-only and cannot be granted to a service account`);
    }
    if (!isGrantableScope(scope)) {
      throw new Error(`Unknown automation scope: "${scope}"`);
    }
    if (!out.includes(scope)) out.push(scope);
  }
  return out;
}
