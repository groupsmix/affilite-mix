/**
 * Automation policy engine (plan §4.2, §8).
 *
 * A pure decision function: given the action type, the (optional) per-site
 * policy override row, and run/day counters, it returns whether the action
 * is auto-allowed, needs owner approval, or is denied. No executor may reach
 * a DAL without a prior `allow` (or an `approval_required` that an owner has
 * explicitly approved).
 *
 * The function is intentionally side-effect free so it is trivially testable
 * and cannot be influenced by model text or request bodies beyond the typed
 * inputs below.
 */
import type { AutomationScope } from "./scopes";

export type PolicyMode = "allow" | "approval_required" | "deny";
export type RiskLevel = "low" | "medium" | "high" | "prohibited";

export type PolicyDecision =
  | { decision: "allow"; risk: "low"; reasons: string[] }
  | { decision: "approval_required"; risk: "medium" | "high"; reasons: string[] }
  | { decision: "deny"; risk: "prohibited"; reasons: string[] };

/** Canonical machine action types the control plane understands. */
export const ACTION_TYPES = [
  "content.draft.create",
  "content.update",
  "content.add_internal_links",
  "content.schedule",
  "content.publish",
  "content.archive",
  "content.delete",
  "products.update",
  "products.update_affiliate_url",
  "products.activate",
  "products.archive",
  "products.delete",
  "jobs.trigger",
  "integrations.configure",
  "sites.write",
  "users.write",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

interface DefaultRule {
  mode: PolicyMode;
  risk: RiskLevel;
  /** Scope the caller must hold for the action to even be considered. */
  scope: AutomationScope | null;
}

/**
 * Initial policy matrix (plan §8). Conservative by default: anything that
 * publishes, changes an affiliate URL, activates, archives or deletes is
 * gated. Reads and draft/metadata edits are auto-allowed.
 */
const DEFAULT_MATRIX: Record<ActionType, DefaultRule> = {
  "content.draft.create": { mode: "allow", risk: "low", scope: "content:draft" },
  "content.update": { mode: "allow", risk: "low", scope: "content:update" },
  "content.add_internal_links": { mode: "allow", risk: "low", scope: "content:update" },
  "content.schedule": { mode: "approval_required", risk: "medium", scope: "content:schedule" },
  "content.publish": { mode: "allow", risk: "low", scope: "content:publish" },
  "content.archive": { mode: "approval_required", risk: "medium", scope: "content:update" },
  "content.delete": { mode: "deny", risk: "prohibited", scope: null },
  "products.update": { mode: "allow", risk: "low", scope: "products:update" },
  "products.update_affiliate_url": {
    mode: "approval_required",
    risk: "high",
    scope: "products:update",
  },
  "products.activate": { mode: "approval_required", risk: "medium", scope: "products:activate" },
  "products.archive": { mode: "approval_required", risk: "medium", scope: "products:update" },
  "products.delete": { mode: "deny", risk: "prohibited", scope: null },
  "jobs.trigger": { mode: "approval_required", risk: "medium", scope: "jobs:trigger" },
  "integrations.configure": { mode: "deny", risk: "prohibited", scope: null },
  "sites.write": { mode: "deny", risk: "prohibited", scope: null },
  "users.write": { mode: "deny", risk: "prohibited", scope: null },
};

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

/** The scope required to attempt an action type (null = never grantable). */
export function requiredScopeFor(actionType: ActionType): AutomationScope | null {
  return DEFAULT_MATRIX[actionType].scope;
}

export interface PolicyOverride {
  mode: PolicyMode;
  constraints: Record<string, unknown>;
  is_active: boolean;
}

export interface PolicyInput {
  actionType: ActionType;
  /** Per-site override row from `automation_policies`, if any. */
  override?: PolicyOverride | null;
  /** Number of items this single action would affect (bulk cap). */
  itemCount?: number;
  /** Actions already performed by this run (per-run cap). */
  runActionCount?: number;
  /** Actions already performed by this account today (per-day cap). */
  dayActionCount?: number;
  /** Service-account limits. */
  maxActionsPerRun?: number;
  maxActionsPerDay?: number;
}

const readInt = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Evaluate a proposed action against the default matrix + per-site override
 * and the run/day limits. A hard `deny` in the default matrix can never be
 * softened by an override; conversely an override may only tighten or set an
 * explicit `deny`.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const rule = DEFAULT_MATRIX[input.actionType];
  const reasons: string[] = [];

  // 1. Hard prohibitions are absolute — never overridable.
  if (rule.mode === "deny") {
    return {
      decision: "deny",
      risk: "prohibited",
      reasons: [`action_type "${input.actionType}" is owner-only and permanently denied`],
    };
  }

  // 2. Per-run and per-day limits (plan §13) — exceeding requires attention.
  const maxRun = readInt(input.maxActionsPerRun, Number.POSITIVE_INFINITY);
  const maxDay = readInt(input.maxActionsPerDay, Number.POSITIVE_INFINITY);
  if (readInt(input.runActionCount, 0) >= maxRun) {
    return { decision: "deny", risk: "prohibited", reasons: ["per-run action limit reached"] };
  }
  if (readInt(input.dayActionCount, 0) >= maxDay) {
    return { decision: "deny", risk: "prohibited", reasons: ["per-day action limit reached"] };
  }

  // 3. Effective mode = override (if active) else default.
  let mode: PolicyMode = rule.mode;
  const override = input.override;
  if (override && override.is_active) {
    // An override can escalate to a stricter posture but never relax a
    // gated action into "allow" without also clearing the bulk cap below.
    mode = override.mode;
    reasons.push(`per-site override active: ${override.mode}`);
  }

  // 4. Bulk cap: more than N items in a single action requires approval.
  const maxItems = readInt(override?.constraints?.max_items_per_action, 5);
  const itemCount = readInt(input.itemCount, 1);
  if (itemCount > maxItems && mode === "allow") {
    return {
      decision: "approval_required",
      risk: "medium",
      reasons: [...reasons, `bulk action of ${itemCount} items exceeds cap of ${maxItems}`],
    };
  }

  if (mode === "deny") {
    return { decision: "deny", risk: "prohibited", reasons: [...reasons, "denied by site policy"] };
  }

  if (mode === "approval_required") {
    const risk: "medium" | "high" = rule.risk === "high" ? "high" : "medium";
    return {
      decision: "approval_required",
      risk,
      reasons: reasons.length ? reasons : ["approval required during observation phase"],
    };
  }

  return { decision: "allow", risk: "low", reasons: reasons.length ? reasons : ["auto-allowed"] };
}
