import { type DalClientGetter } from "./dal/dal-client";
// audit_log INSERT is granted to service_role only (migration 2026050103,
// `audit_log_service_insert`). The tenant/authenticated client is RLS-denied —
// and degrades to anon on any SUPABASE_JWT_SECRET mismatch — so defaulting to it
// silently dropped every audit event. The audit *reader* (audit-log page) and
// lib/dal/admin-users already use this gateway for the same reason. This module
// is on the SERVICE_ROLE_IMPORT_ALLOWLIST and is reached only from server-side
// admin/auth handlers that have already gated the caller.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { captureException } from "@/lib/sentry";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { logger } from "@/lib/logger";

export interface AuditEvent {
  site_id: string;
  actor: string; // The human-readable actor name (e.g. email)
  actor_user_id?: string; // F-045: Strongly-typed UUID for the admin_user
  action: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, unknown>;
  ip?: string;
  // F-21: Distinguish authentication vs authorization failures for security analysis
  // authn: User identity verification failed (wrong password, invalid token, etc.)
  // authz: User is authenticated but lacks permission for the requested action
  failure_type?: "authn" | "authz";
}

// A8-005: Schema-based audit redaction allowlist.
// Fields not in this allowlist are redacted from audit details to prevent
// PII / secrets from leaking into the audit trail.
const AUDIT_DETAIL_ALLOWLIST: Record<string, string[]> = {
  // Product fields that are safe to audit
  product: [
    "name",
    "slug",
    "status",
    "category_id",
    "price",
    "price_amount",
    "price_currency",
    "merchant",
    "score",
    "featured",
    "cta_text",
    "deal_text",
    "deal_expires_at",
    "field",
  ],
  // Content fields
  content: ["title", "slug", "status", "publish_at", "field"],
  // Page fields
  page: ["title", "slug", "status", "field"],
  // Category fields
  category: ["name", "slug", "status", "field"],
  // Upload fields
  upload: ["contentType", "fileSize"],
  // Auth events
  admin_user: ["role"],
  // A167-01: Membership audit trail
  membership: [
    "status",
    "tier",
    "stripe_subscription_id",
    "stripe_customer_id",
    "current_period_start",
    "current_period_end",
    "previous_status",
    "reason",
  ],
  // A167-02: Commission status changes
  commission: ["status", "previous_status", "amount", "currency", "reason"],
};

/** A8-005: Redact sensitive fields from audit details based on an allowlist. */
function redactAuditDetails(
  entityType: string,
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const allowed = AUDIT_DETAIL_ALLOWLIST[entityType];
  // If no allowlist is defined for this entity type, only permit a small
  // default set of safe fields to prevent accidental PII leakage.
  if (!allowed) {
    const defaultSafe: Record<string, unknown> = {};
    for (const key of ["name", "slug", "status", "id"]) {
      if (key in details) defaultSafe[key] = details[key];
    }
    return defaultSafe;
  }
  const redacted: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in details) redacted[key] = details[key];
  }
  const changedField = details.field;
  if (
    typeof changedField === "string" &&
    changedField !== "field" &&
    allowed.includes(changedField)
  ) {
    if ("oldValue" in details) redacted.oldValue = details.oldValue;
    if ("newValue" in details) redacted.newValue = details.newValue;
  }
  return redacted;
}

// ---------------------------------------------------------------------------
// G-06: Queue + DLQ types
// ---------------------------------------------------------------------------

/** Cloudflare Queue binding shape (subset used here). */
interface AuditQueue {
  send(message: AuditEvent): Promise<void>;
}

/** Cloudflare R2 bucket binding shape (subset used here). */
interface AuditR2Bucket {
  put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<unknown>;
}

/** Resolve the AUDIT_QUEUE Cloudflare binding, if available. */
function getAuditQueue(): AuditQueue | undefined {
  try {
    const binding = getRuntimeEnv().AUDIT_QUEUE;
    if (binding && typeof binding.send === "function") return binding;
  } catch {
    // fail-open: best-effort [criticality:defence-in-depth]
    // Binding not available (local dev, CI, etc.)
  }
  return undefined;
}

/** Resolve the AUDIT_DLQ_BUCKET R2 binding for dead-letter persistence. */
function getAuditDlqBucket(): AuditR2Bucket | undefined {
  try {
    const binding = getRuntimeEnv().AUDIT_DLQ_BUCKET;
    if (binding && typeof binding.put === "function") return binding;
  } catch {
    // fail-open: best-effort [criticality:defence-in-depth]
    // Binding not available
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// G-06: R2 NDJSON dead-letter fallback
// ---------------------------------------------------------------------------

/**
 * Write a failed audit event to R2 as NDJSON so it can be replayed later.
 * Key format: `dlq/audit/{YYYY-MM-DD}/{timestamp}-{random}.ndjson`
 */
async function writeToDlq(event: AuditEvent): Promise<void> {
  const bucket = getAuditDlqBucket();
  if (!bucket) return;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  // A6-04: use CSPRNG (crypto.randomUUID) instead of Math.random so DLQ keys
  // are unpredictable and cannot be enumerated by a bucket-listing attacker.
  const key = `dlq/audit/${day}/${now.getTime()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.ndjson`;

  try {
    await bucket.put(key, JSON.stringify(event) + "\n");
  } catch (err) {
    // Last-resort: if even R2 fails, just log. We never throw from audit
    // code -- the caller's request must not fail because of audit infra.
    logger.error("[audit-log] DLQ write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record an audit event.
 *
 * G-06 write path (in priority order):
 *   1. Cloudflare Queue (`AUDIT_QUEUE` binding) -- durable, async.
 *   2. Direct Supabase insert with one retry -- synchronous fallback.
 *   3. R2 NDJSON dead-letter (`AUDIT_DLQ_BUCKET`) -- cold storage for replay.
 *   4. Analytics Engine counter -- metric-only breadcrumb.
 *
 * Critical callers (e.g. password change, role escalation) should `await`
 * this function. Non-critical callers may fire-and-forget.
 */
/**
 * S1-A3.R1: Critical actions (role changes, deletions, password resets) must
 * fail the parent operation if the audit write cannot be persisted anywhere.
 * Callers pass `{ critical: true }` to opt in; non-critical callers (the
 * default) get the existing best-effort behaviour.
 */
export class AuditWriteError extends Error {
  constructor(action: string) {
    super(`Audit write failed for critical action: ${action}`);
    this.name = "AuditWriteError";
  }
}

/**
 * Audit writes use the privileged service_role client by default.
 *
 * The `audit_log` RLS exposes exactly one unconditional INSERT policy —
 * `audit_log_service_insert` (to service_role, WITH CHECK true). The
 * request-scoped tenant client runs as `authenticated`, which is only
 * permitted by the brittle `tenant_isolation_auth_audit_log` policy (needs an
 * `app_metadata.site_id` JWT claim equal to the row's site_id) and is
 * otherwise RLS-denied — and degrades to `anon` (hard-denied) on any
 * SUPABASE_JWT_SECRET mismatch. Defaulting to the tenant client silently
 * dropped every audit event. The audit *reader* already uses this privileged
 * client; the writer now matches it.
 */
const defaultAuditClientGetter: DalClientGetter = () => getPrivilegedSupabaseClient("audit-log");

/** Canonical UUID matcher; used to null out non-uuid sentinels like "_global". */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordAuditEvent(
  event: AuditEvent,
  getClient: DalClientGetter = defaultAuditClientGetter,
  options: { critical?: boolean } = {},
): Promise<void> {
  // ── Path 1: Queue-backed write (preferred) ──────────────────────
  const queue = getAuditQueue();
  if (queue) {
    try {
      await queue.send(event);
      return; // Success -- queue consumer handles DB insert + retries.
    } catch (err) {
      logger.error("[audit-log] Queue send failed, falling back to direct insert", {
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, { context: "audit-log.queue-send" });
      // Fall through to direct insert
    }
  }

  // ── Path 2: Direct Supabase insert with single retry ────────────
  // A8-005: Redact sensitive fields from audit details before persistence
  const redactedDetails = redactAuditDetails(event.entity_type, event.details) ?? {};
  const row = {
    // `audit_log.site_id` is a nullable uuid column. Cross-site / auth events
    // use the sentinel "_global", which is NOT a valid uuid and throws
    // "invalid input syntax for type uuid". Store NULL for any non-uuid
    // site_id so global events persist instead of silently failing.
    site_id: UUID_RE.test(event.site_id ?? "") ? event.site_id : null,
    actor: event.actor,
    actor_user_id: event.actor_user_id ?? null,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    details: redactedDetails,
    ip: event.ip ?? null,
    // F-21: Include failure_type to distinguish authn vs authz failures
    failure_type: event.failure_type ?? null,
  };

  const sb = await getClient();
  // audit_log is a cross-tenant ledger: rows exist for every site and for
  // global / auth events (site_id = NULL). The privileged client's F-API-01
  // site-filter guard is therefore satisfied with the explicit cross-tenant
  // opt-out rather than an .eq('site_id', …) predicate — see lib/dal/admin-users
  // and lib/dal/sites for the same pattern on other global tables.
  const { error } = await sb.from("audit_log").insert(row).unsafeNoSiteFilter();

  if (error) {
    logger.error("[audit-log] Insert failed, retrying once", { error: error.message });
    // A74-F2: Apply a short jittered delay before retry to avoid
    // hammering Supabase during congestion. Base 100ms + up to 100ms jitter.
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 100));
    const { error: retryError } = await sb.from("audit_log").insert(row).unsafeNoSiteFilter();
    if (retryError) {
      logger.error("[audit-log] Retry also failed", { error: retryError.message });

      // ── Path 3: R2 DLQ fallback ──────────────────────────────────
      await writeToDlq(event);

      // ── Path 4: Analytics Engine breadcrumb ──────────────────────
      try {
        const analytics = getRuntimeEnv().ANALYTICS_ENGINE;
        if (analytics && analytics.writeDataPoint) {
          analytics.writeDataPoint({
            blobs: ["audit_log_failure", event.site_id, event.actor, event.action],
            doubles: [1],
            indexes: [event.site_id],
          });
        }
      } catch {
        // fail-open: best-effort [criticality:telemetry]
        // Silently ignore if Analytics Engine is not bound
      }

      // S1-A3.R1: For critical actions, throw so the caller can abort the
      // parent operation. All four persistence paths have been exhausted.
      if (options.critical) {
        throw new AuditWriteError(event.action);
      }
    }
  }
}
