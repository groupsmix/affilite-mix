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
  /**
   * A61-A85: Classification of the data sensitivity handled in this action.
   * Values: "low", "medium", "high", "critical"
   */
  sensitivity?: "low" | "medium" | "high" | "critical";
}

/** Options for recordAuditEvent to control durability guarantees. */
export interface AuditOptions {
  /**
   * When true, the audit write is awaited and failures are thrown.
   * Use for critical actions (password changes, role escalation,
   * privacy restriction) where the audit trail must be durable.
   * Default: false (fire-and-forget for non-critical actions).
   */
  awaitDurable?: boolean;
  /** Override the default DAL client getter. */
  getClient?: DalClientGetter;
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
 * Critical callers (e.g. password change, role escalation, privacy restriction)
 * should set `awaitDurable: true` so the audit write blocks and failures throw.
 * Non-critical callers may omit the option (fire-and-forget).
 */
export async function recordAuditEvent(
  event: AuditEvent,
  options?: AuditOptions,
): Promise<void> {
  const getClient = options?.getClient ?? defaultDalClientGetter;
  const awaitDurable = options?.awaitDurable ?? false;

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
  const row = {
    site_id: event.site_id,
    actor: event.actor,
    actor_user_id: event.actor_user_id ?? null,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    details: event.details ?? {},
    ip: event.ip ?? null,
    // A61-A85: Store sensitivity classification for compliance reporting
    sensitivity: event.sensitivity ?? "low",
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

      // A4-W09: For critical actions, a failed audit write is a hard failure
      if (awaitDurable) {
        throw new Error(
          `Audit write failed for critical action '${event.action}' on ${event.entity_type}:${event.entity_id}. ` +
            `The operation completed but the audit trail is not durable. Retry required.`,
        );
      }
    }
  }
}
