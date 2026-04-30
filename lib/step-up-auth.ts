/**
 * FIX-18 (F-030): Step-up authentication for sensitive admin operations.
 *
 * Certain admin operations (password change, 2FA disable, site deletion,
 * user role changes) require re-verification of the user's identity
 * even within an active session. This prevents a stolen admin session
 * cookie from being used for the most destructive operations without
 * the user's knowledge.
 *
 * Step-up auth works by requiring a recent password verification or
 * TOTP verification, recorded as a `step_up_at` timestamp in the
 * session. Operations protected by step-up auth check that this
 * timestamp is within the allowed window (default 15 minutes).
 *
 * Usage in route handlers:
 *   import { requireStepUpAuth } from "@/lib/step-up-auth";
 *   const stepUpError = requireStepUpAuth(session);
 *   if (stepUpError) return stepUpError;
 */

import { NextResponse } from "next/server";
import type { AdminPayload } from "@/lib/auth";

/** How long a step-up verification remains valid (15 minutes). */
const STEP_UP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Session field name for the step-up timestamp.
 * Set after a successful password or TOTP verification.
 */
export const STEP_UP_CLAIM = "step_up_at" as const;

/**
 * Check if the session has a valid step-up authentication within
 * the allowed window. Returns a 403 NextResponse if not, or null
 * if the step-up is valid.
 */
export function requireStepUpAuth(
  session: AdminPayload | null,
  options?: { windowMs?: number },
): NextResponse | null {
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const windowMs = options?.windowMs ?? STEP_UP_WINDOW_MS;
  const stepUpAt = (session as unknown as Record<string, unknown>)[STEP_UP_CLAIM];

  if (!stepUpAt || typeof stepUpAt !== "number") {
    return NextResponse.json(
      {
        error: "Step-up authentication required",
        reason:
          "This operation requires recent password or 2FA verification. Please re-authenticate.",
      },
      { status: 403 },
    );
  }

  const elapsed = Date.now() - stepUpAt;
  if (elapsed > windowMs) {
    return NextResponse.json(
      {
        error: "Step-up authentication expired",
        reason: `Step-up verification was ${Math.round(elapsed / 60000)}min ago — maximum is ${Math.round(windowMs / 60000)}min. Please re-authenticate.`,
      },
      { status: 403 },
    );
  }

  return null; // Step-up is valid
}

/**
 * Mark a session as step-up authenticated at the given timestamp.
 * Call this after a successful password or TOTP verification.
 */
export function markStepUpAuth(session: AdminPayload): AdminPayload {
  return {
    ...session,
    [STEP_UP_CLAIM]: Date.now(),
  } as AdminPayload;
}
