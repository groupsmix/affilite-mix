import { NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";

/**
 * Shared save-error mapping for admin write endpoints.
 *
 * F-010 (admin-launch-blockers, Property 2 / Requirement 2.5): when a CMS write
 * fails, the API must surface the *actual, actionable cause* (e.g. an
 * unprovisioned site, an RLS denial) and an *error reference id* so the operator
 * can correlate the failure with logs/Sentry — instead of a generic
 * "Failed to save."
 *
 * The mapping is deliberately conservative: only well-understood Postgres /
 * PostgREST failure codes are translated into specific, user-safe guidance. All
 * other errors keep a generic message but still carry a reference id, so no
 * upstream diagnostics leak while the failure remains traceable.
 */

/** A reference id field name the admin UI / clients can rely on. */
export const ERROR_REFERENCE_FIELD = "errorId" as const;

/** Postgres / PostgREST error codes we map to actionable, user-safe messages. */
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const NOT_NULL_VIOLATION = "23502";
const CHECK_VIOLATION = "23514";
// 42501 = insufficient_privilege; PostgREST surfaces RLS denials as 42501 too.
const INSUFFICIENT_PRIVILEGE = "42501";
// PostgREST returns this when a row-level-security policy blocks the write.
const PGRST_RLS_DENIED = "PGRST301";

interface MappedSaveError {
  /** HTTP status to return. */
  status: number;
  /** Human-readable, actionable message safe to show the operator. */
  message: string;
  /** Stable, machine-readable error code. */
  code: string;
}

/** Extract a Postgres/PostgREST error code from an unknown thrown value. */
function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

/**
 * Map a known database failure to an actionable message + code. Returns a
 * generic 500 mapping for anything we do not specifically recognise.
 */
export function mapSaveError(err: unknown): MappedSaveError {
  switch (errorCodeOf(err)) {
    case FOREIGN_KEY_VIOLATION:
      // The dominant unprovisioned-site failure: the `*.site_id` FK has no
      // matching `sites` row because the tenant was never provisioned/seeded.
      return {
        status: 422,
        message:
          "This site isn't provisioned in the database yet. Run site provisioning for this tenant, then try again.",
        code: "SITE_NOT_PROVISIONED",
      };
    case INSUFFICIENT_PRIVILEGE:
    case PGRST_RLS_DENIED:
      return {
        status: 403,
        message:
          "The database blocked this write under its row-level-security policy. Check that this account has access to the active site.",
        code: "RLS_DENIED",
      };
    case UNIQUE_VIOLATION:
      return {
        status: 409,
        message: "A record with these details already exists. Use a different value and try again.",
        code: "DUPLICATE_RECORD",
      };
    case NOT_NULL_VIOLATION:
      return {
        status: 422,
        message: "A required field was missing when saving. Check the form and try again.",
        code: "MISSING_REQUIRED_FIELD",
      };
    case CHECK_VIOLATION:
      return {
        status: 422,
        message: "A value failed a database validation rule. Check the form and try again.",
        code: "CONSTRAINT_VIOLATION",
      };
    default:
      return {
        status: 500,
        message: "The save failed unexpectedly. Quote the reference id below when reporting this.",
        code: "SAVE_FAILED",
      };
  }
}

/**
 * Generate a short, unpredictable error reference id the operator can quote and
 * we can correlate with logs / Sentry.
 */
export function generateErrorReferenceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `err_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `err_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Build the standardised JSON error response for a failed admin save.
 *
 * - Maps the known failure to an actionable message + code.
 * - Attaches an `errorId` reference id to the body.
 * - Captures the underlying exception to Sentry/logs tagged with the same
 *   reference id so the operator can correlate the two.
 */
export function saveErrorResponse(err: unknown, context: string): NextResponse {
  const mapped = mapSaveError(err);
  const referenceId = generateErrorReferenceId();

  captureException(err, { context, errorId: referenceId, code: mapped.code });

  return NextResponse.json(
    { error: mapped.message, code: mapped.code, [ERROR_REFERENCE_FIELD]: referenceId },
    { status: mapped.status },
  );
}
