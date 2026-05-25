import { defaultDalClientGetter, type DalClientGetter } from "./dal/dal-client";
import { captureException } from "@/lib/sentry";

export interface AuditEvent {
  site_id: string;
  actor: string; // The human-readable actor name (e.g. email)
  actor_user_id?: string; // F-045: Strongly-typed UUID for the admin_user
  action: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, unknown>;
  ip?: string;
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
    // Change-tracking metadata
    "field",
    "oldValue",
    "newValue",
  ],
  // Content fields
  content: ["title", "slug", "status", "publish_at", "field", "oldValue", "newValue"],
  // Page fields
  page: ["title", "slug", "status", "field", "oldValue", "newValue"],
  // Category fields
  category: ["name", "slug", "status", "field", "oldValue", "newValue"],
  // Upload fields
  upload: ["contentType", "fileSize"],
  // Auth events
  admin_user: ["role"],
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
    const binding = (process.env as any).AUDIT_QUEUE;
    if (binding && typeof binding.send === "function") return binding as AuditQueue;
  } catch {
    // Binding not available (local dev, CI, etc.)
  }
  return undefined;
}

/** Resolve the AUDIT_DLQ_BUCKET R2 binding for dead-letter persistence. */
function getAuditDlqBucket(): AuditR2Bucket | undefined {
  try {
    const binding = (process.env as any).AUDIT_DLQ_BUCKET;
    if (binding && typeof binding.put === "function") return binding as AuditR2Bucket;
  } catch {
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
    console.error("[audit-log] DLQ write failed:", err);
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
export async function recordAuditEvent(
  event: AuditEvent,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  // ── Path 1: Queue-backed write (preferred) ──────────────────────
  const queue = getAuditQueue();
  if (queue) {
    try {
      await queue.send(event);
      return; // Success -- queue consumer handles DB insert + retries.
    } catch (err) {
      console.error("[audit-log] Queue send failed, falling back to direct insert:", err);
      captureException(err, { context: "audit-log.queue-send" });
      // Fall through to direct insert
    }
  }

  // ── Path 2: Direct Supabase insert with single retry ────────────
  // A8-005: Redact sensitive fields from audit details before persistence
  const redactedDetails = redactAuditDetails(event.entity_type, event.details) ?? {};
  const row = {
    site_id: event.site_id,
    actor: event.actor,
    actor_user_id: event.actor_user_id ?? null,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    details: redactedDetails,
    ip: event.ip ?? null,
  };

  const sb = await getClient();
  const { error } = await sb.from("audit_log").insert(row);

  if (error) {
    console.error("[audit-log] Insert failed, retrying once:", error.message);
    // A74-F2: Apply a short jittered delay before retry to avoid
    // hammering Supabase during congestion. Base 100ms + up to 100ms jitter.
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 100));
    const { error: retryError } = await sb.from("audit_log").insert(row);
    if (retryError) {
      console.error("[audit-log] Retry also failed:", retryError.message);

      // ── Path 3: R2 DLQ fallback ──────────────────────────────────
      await writeToDlq(event);

      // ── Path 4: Analytics Engine breadcrumb ──────────────────────
      try {
        const analytics = (process.env as any).ANALYTICS_ENGINE as any;
        if (analytics && analytics.writeDataPoint) {
          analytics.writeDataPoint({
            blobs: ["audit_log_failure", event.site_id, event.actor, event.action],
            doubles: [1],
            indexes: [event.site_id],
          });
        }
      } catch {
        // Silently ignore if Analytics Engine is not bound
      }
    }
  }
}
