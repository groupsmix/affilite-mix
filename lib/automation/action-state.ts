/**
 * Durable action state machine (plan §4.3).
 *
 *   proposed
 *     -> approved | policy_allowed
 *     -> queued -> running -> verifying -> succeeded -> rolled_back
 *
 *   failure branches: retry_wait | failed | manual_attention | cancelled
 *
 * `canTransition` is the single authority for legal moves so no executor can
 * push an action into an inconsistent state.
 */
export const ACTION_STATES = [
  "proposed",
  "approved",
  "policy_allowed",
  "queued",
  "running",
  "verifying",
  "succeeded",
  "rolled_back",
  "retry_wait",
  "failed",
  "manual_attention",
  "cancelled",
] as const;

export type ActionState = (typeof ACTION_STATES)[number];

const TRANSITIONS: Record<ActionState, readonly ActionState[]> = {
  proposed: ["approved", "policy_allowed", "manual_attention", "cancelled", "failed"],
  approved: ["queued", "cancelled"],
  policy_allowed: ["queued", "running", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["verifying", "succeeded", "retry_wait", "failed", "manual_attention"],
  verifying: ["succeeded", "rolled_back", "failed", "manual_attention"],
  succeeded: ["rolled_back"],
  retry_wait: ["running", "failed", "cancelled"],
  failed: ["manual_attention"],
  manual_attention: ["approved", "queued", "cancelled"],
  rolled_back: [],
  cancelled: [],
};

/** Terminal states cannot transition further (except succeeded -> rolled_back). */
export const TERMINAL_STATES: readonly ActionState[] = ["rolled_back", "cancelled"];

export function isActionState(value: string): value is ActionState {
  return (ACTION_STATES as readonly string[]).includes(value);
}

export function canTransition(from: ActionState, to: ActionState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws when the transition is illegal; returns `to` otherwise. */
export function assertTransition(from: ActionState, to: ActionState): ActionState {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal automation action transition: ${from} -> ${to}`);
  }
  return to;
}
