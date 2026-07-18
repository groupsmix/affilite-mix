import { NextRequest, NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { getInternalTokenFor } from "@/lib/internal-auth";
import { verifyInternalHmac } from "@/lib/internal-hmac";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { untypedFrom } from "@/lib/dal/type-guards";
import { getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";

/**
 * POST /api/queue/clicks
 *
 * F-028: consumes batches of click-tracking queue messages published by
 * CLICK_QUEUE and inserts them into `affiliate_clicks` in a single batch
 * write. Called exclusively from the Worker `queue` handler (see
 * workers/custom-worker.ts); the shared INTERNAL_API_TOKEN gates access.
 *
 * F-002 (deep audit): this endpoint uses the privileged server-only
 * Supabase client rather than `getTenantClient()`. The Worker queue
 * dispatcher cannot supply an `x-site-id` request header — there is no
 * cookie context, no admin session, and the per-message `site_id` lives
 * in the JSON body. Without that header the tenant JWT minted by
 * `getTenantClient()` carries no `site_id` claim, and the
 * `tenant_isolation_auth_<table>` RLS policies (migration 00067) deny
 * the insert. The endpoint is already token-gated by INTERNAL_API_TOKEN,
 * so privileged access is the appropriate model here.
 *
 * On any unexpected error we return 500 so Cloudflare Queues retries the
 * batch with backoff and eventually routes it to the dead-letter queue.
 */

/**
 * T-12: per-isolate flag so the "permissive in production" warning fires
 * once per cold start instead of on every request.
 */
let permissivePosturedLogged = false;

interface ClickMessage {
  site_id?: string;
  product_name?: string;
  affiliate_url?: string;
  content_slug?: string;
  referrer?: string;
  click_id?: string;
  ts?: number;
}

/**
 * audit5-#13: the queue worker sends either the legacy flat shape
 * `{ messages: ClickMessage[] }` (pre-#13 worker build) or the new
 * envelope shape `{ messages: [{ msgId, body }, ...] }` so the API
 * can answer with per-message acked/failed lists. We support both
 * here for the duration of a rolling worker deploy.
 */
interface ClickEnvelope {
  msgId?: string;
  body?: ClickMessage;
}

type QueueMessage = ClickMessage | ClickEnvelope;

interface QueueBody {
  messages?: QueueMessage[];
}

function unwrapMessage(m: QueueMessage): { msgId: string | undefined; click: ClickMessage } {
  if (m && typeof m === "object" && "body" in m && m.body && typeof m.body === "object") {
    const env = m as ClickEnvelope;
    return {
      msgId: typeof env.msgId === "string" ? env.msgId : undefined,
      click: env.body as ClickMessage,
    };
  }
  // Legacy shape — a raw ClickMessage with no msgId wrapper.
  return { msgId: undefined, click: m as ClickMessage };
}

/**
 * F-014: payload validation caps. Cloudflare Queues batch up to 100
 * messages by default, so anything above that is either misconfigured
 * or hostile. Field-level caps mirror the column types in
 * `affiliate_clicks` (text columns are unconstrained at the DB layer
 * but values much longer than these caps are storage abuse, not
 * legitimate clicks).
 */
const MAX_MESSAGES_PER_BATCH = 200;
const MAX_AFFILIATE_URL_LEN = 2048;
const MAX_PRODUCT_NAME_LEN = 512;
const MAX_CONTENT_SLUG_LEN = 256;
const MAX_REFERRER_LEN = 2048;
const MAX_CLICK_ID_LEN = 128;
const SITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);
const CLICK_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * S9-H2: Circuit breaker for Supabase click inserts. Prevents connection
 * pool exhaustion under sustained load by short-circuiting after 3
 * consecutive failures with a 15s recovery window. When open, returns 500
 * so Cloudflare Queues backs off and routes to DLQ after max_retries.
 */
const supabaseClicksBreaker = getCircuitBreaker("supabase-clicks", {
  failureThreshold: 3,
  recoveryTimeoutMs: 15_000,
});

function isHttpUrl(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return false;
  }
  return ALLOWED_URL_PROTOCOLS.has(url.protocol);
}

function isValidMessage(
  m: ClickMessage,
): m is Required<Pick<ClickMessage, "site_id" | "product_name" | "affiliate_url">> & ClickMessage {
  if (typeof m.site_id !== "string" || !SITE_ID_RE.test(m.site_id)) return false;
  if (
    typeof m.product_name !== "string" ||
    m.product_name.length === 0 ||
    m.product_name.length > MAX_PRODUCT_NAME_LEN
  ) {
    return false;
  }
  if (typeof m.affiliate_url !== "string" || !isHttpUrl(m.affiliate_url, MAX_AFFILIATE_URL_LEN)) {
    return false;
  }
  if (m.content_slug !== undefined) {
    if (typeof m.content_slug !== "string" || m.content_slug.length > MAX_CONTENT_SLUG_LEN) {
      return false;
    }
  }
  if (m.referrer !== undefined) {
    // Referrer is optional and may be empty; reject only on type/length
    // mismatch. We allow empty or non-URL values because some browsers
    // strip the referrer header to a non-URL token.
    if (typeof m.referrer !== "string" || m.referrer.length > MAX_REFERRER_LEN) {
      return false;
    }
  }
  if (m.click_id !== undefined) {
    if (
      typeof m.click_id !== "string" ||
      m.click_id.length === 0 ||
      m.click_id.length > MAX_CLICK_ID_LEN ||
      !CLICK_ID_RE.test(m.click_id)
    ) {
      return false;
    }
  }
  return true;
}

export async function POST(request: NextRequest) {
  let expected: string;
  try {
    // A-019 / NEW-003: Use the purpose-specific click-queue token so a
    // leaked INTERNAL_API_TOKEN cannot forge queue ingestion calls.
    // Falls back to the monolithic INTERNAL_API_TOKEN when
    // INTERNAL_API_TOKEN_CLICK_QUEUE is not configured (transition window).
    expected = getInternalTokenFor("click_queue");
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "Internal auth misconfigured" }, { status: 500 });
  }

  // FIX-03 (F-003): Prefer HMAC verification; fall back to legacy Bearer token
  // during migration. Set INTERNAL_HMAC_MIGRATION_MODE=strict to reject Bearer.
  //
  // T-12 (consolidated launch audit): in production we default to strict
  // mode unless the operator has *explicitly* opted into the permissive
  // legacy fallback by setting INTERNAL_HMAC_MIGRATION_MODE=permissive.
  // The previous default ("permissive when unset") meant a leaked
  // INTERNAL_API_TOKEN in production could forge queue ingestion via
  // bearer auth even after the worker was migrated to HMAC. Operators
  // can still flip back to permissive during a rollout window.
  const rawMode = process.env.INTERNAL_HMAC_MIGRATION_MODE ?? "";
  const isProd = process.env.NODE_ENV === "production";
  // A7-009: Time-boxed migration — after the deadline, permissive mode
  // is forcibly overridden to strict regardless of the env var.
  const migrationDeadlineStr = process.env.INTERNAL_HMAC_MIGRATION_DEADLINE ?? "";
  const migrationDeadline = migrationDeadlineStr ? new Date(migrationDeadlineStr) : null;
  const deadlinePassed =
    migrationDeadline &&
    !isNaN(migrationDeadline.getTime()) &&
    Date.now() > migrationDeadline.getTime();
  const migrationMode = deadlinePassed
    ? "strict"
    : rawMode === "permissive"
      ? "permissive"
      : isProd
        ? "strict"
        : rawMode || "permissive";
  // Surface a one-time warning if the operator explicitly opted into
  // permissive mode in production so the reduced posture is visible.
  if (isProd && rawMode === "permissive" && !permissivePosturedLogged) {
    permissivePosturedLogged = true;
    logger.warn("internal_hmac_permissive_in_prod", {
      hint: "INTERNAL_HMAC_MIGRATION_MODE=permissive in production — legacy bearer fallback is enabled.",
    });
  }
  const bodyText = await request.text();
  const hmacResult = await verifyInternalHmac(expected, request, bodyText);

  if (!hmacResult.valid) {
    // Fallback: legacy Bearer token (permissive mode only)
    if (migrationMode === "permissive") {
      const authHeader = request.headers.get("authorization") ?? "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
      if (bearer !== expected) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // Track legacy bearer use so operators can confirm migration is complete.
      logger.warn("internal_hmac_legacy_bearer_used", {
        path: "/api/queue/clicks",
      });
    } else {
      return NextResponse.json({ error: "Forbidden", reason: hmacResult.reason }, { status: 403 });
    }
  }

  const isDlq = request.nextUrl.searchParams.get("dlq") === "true";

  let body: QueueBody;
  try {
    body = JSON.parse(bodyText) as QueueBody;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // F-014: cap batch size. Cloudflare Queues batch consumer config in
  // wrangler.jsonc sets max_batch_size=100; rejecting at 200 leaves
  // headroom for the DLQ replay path while still bounding the cost of
  // a malformed/hostile invocation.
  if (messages.length > MAX_MESSAGES_PER_BATCH) {
    return NextResponse.json(
      { error: "Batch too large", limit: MAX_MESSAGES_PER_BATCH },
      { status: 413 },
    );
  }

  try {
    // audited-service-role: HMAC-gated internal queue consumer; per-row site_id
    // is enforced via WITH CHECK policy. Minting a tenant JWT per batch is
    // cost-prohibitive on the hottest write path.
    const sb = getPrivilegedSupabaseClient();

    if (isDlq) {
      // F-024: DLQ messages are persisted to click_failures for durable recovery
      const dlqRows = messages.map((m) => {
        const { click } = unwrapMessage(m);
        return {
          payload: click as unknown as Record<string, unknown>,
          error_message: "DLQ message",
        };
      });

      // F-API-01: `click_failures` is a global DLQ table with no site_id column.
      // DLQ rows wrap the failed message payload (which itself carries site_id).
      const { error } = await untypedFrom(sb, "click_failures")
        .insert(dlqRows)
        .unsafeNoSiteFilter();
      if (error) {
        captureException(new Error(`Failed to persist DLQ messages: ${error.message}`), {
          context: "[api/queue/clicks] DLQ",
        });
        return NextResponse.json({ error: "DLQ insert failed" }, { status: 500 });
      }

      // M3: DLQ processing succeeded. This is a notable-but-normal event, not
      // an error — emitting it via captureException polluted Sentry's error
      // stream on every DLQ batch and caused alert fatigue. Log it as a
      // structured warning instead; DLQ *depth* is alerted separately
      // (click_tracking_dlq_depth, terraform/cloudflare/alerts.tf).
      logger.warn("click_queue_dlq_processed", {
        context: "[api/queue/clicks] DLQ processing",
        processed: dlqRows.length,
      });

      return NextResponse.json({ ok: true, inserted: dlqRows.length });
    }

    // audit5-#13: keep msgId associated with each click so the response
    // envelope can list per-message outcomes for the worker. The
    // type predicate on `isValidMessage` narrows the `.click` shape
    // when invoked directly on the click, so we partition into two
    // typed arrays.
    type UnwrappedValid = {
      msgId: string | undefined;
      click: Required<Pick<ClickMessage, "site_id" | "product_name" | "affiliate_url">> &
        ClickMessage;
    };
    type UnwrappedInvalid = { msgId: string | undefined; click: ClickMessage };
    const unwrapped = messages.map(unwrapMessage);
    const validUnwrapped: UnwrappedValid[] = [];
    const rejectedUnwrapped: UnwrappedInvalid[] = [];
    for (const u of unwrapped) {
      if (isValidMessage(u.click)) {
        validUnwrapped.push({ msgId: u.msgId, click: u.click });
      } else {
        rejectedUnwrapped.push(u);
      }
    }
    const validMessages = validUnwrapped.map((u) => u.click);
    const rejectedMessages = rejectedUnwrapped.map((u) => u.click);
    const rejectedCount = rejectedMessages.length;
    // Build acked/failed accumulators — only populated when at least one
    // message in the batch carried a msgId (new envelope shape). Legacy
    // flat-shape callers continue to see the existing response without
    // the per-message lists.
    const ackedIds: string[] = [];
    const failedIds: string[] = [];
    const anyMsgId = unwrapped.some((u) => typeof u.msgId === "string");
    if (anyMsgId) {
      for (const u of rejectedUnwrapped) {
        if (u.msgId) failedIds.push(u.msgId);
      }
    }
    if (rejectedCount > 0) {
      // F-014: structured rejection metric. We never throw on rejected
      // messages because Cloudflare Queues retries the *whole* batch on
      // 5xx, which would just replay the bad messages. Logging via
      // captureException routes them to Sentry with the count attached.
      captureException(
        new Error(`[api/queue/clicks] dropped ${rejectedCount} invalid message(s)`),
        { context: "[api/queue/clicks] validation" },
      );
      // A-006: Persist rejected messages to click_failures for reconciliation.
      const rejectedRows = rejectedMessages.map((m) => ({
        payload: m as unknown as Record<string, unknown>,
        error_message: "queue consumer validation reject",
      }));
      // Fire-and-forget — don't fail the batch on insert error.
      void untypedFrom(sb, "click_failures")
        .insert(rejectedRows)
        // F-API-01: same opt-out as the DLQ branch above — the
        // `click_failures` table is a global queue-failure log with
        // no `site_id` column.
        .unsafeNoSiteFilter()
        .then((res: { error?: { message: string } | null }) => {
          if (res.error) {
            captureException(
              new Error(`Failed to persist rejected messages: ${res.error.message}`),
              {
                context: "[api/queue/clicks] click_failures insert",
              },
            );
          }
        });
    }

    const rows = validMessages.map((m) => {
      const row: {
        site_id: string;
        product_name: string;
        affiliate_url: string;
        content_slug: string;
        referrer: string;
        click_id?: string;
      } = {
        site_id: m.site_id,
        product_name: m.product_name,
        affiliate_url: m.affiliate_url,
        content_slug: m.content_slug ?? "",
        referrer: m.referrer ?? "",
      };
      if (m.click_id) row.click_id = m.click_id;
      return row;
    });

    if (rows.length === 0) {
      const emptyResponse: Record<string, unknown> = {
        ok: true,
        inserted: 0,
        rejected: rejectedCount,
      };
      if (anyMsgId) {
        // audit5-#13: rejections were already ack'd-as-failed above; the
        // worker will retry those (it's the right call — a transient
        // validator change might accept them on retry).
        emptyResponse.acked = ackedIds;
        emptyResponse.failed = failedIds;
      }
      return NextResponse.json(emptyResponse);
    }

    // S9-H2: Wrap the Supabase upsert in a circuit breaker to prevent
    // connection pool exhaustion under sustained load. The breaker treats
    // Supabase-level errors (returned via { error }) as failures by throwing,
    // so the breaker counts them toward the failure threshold.
    // Use upsert with ignoreDuplicates so retried queue messages with the
    // same click_id are silently skipped (ON CONFLICT (click_id) DO NOTHING).
    let upsertError: Error | null = null;
    try {
      await supabaseClicksBreaker.execute(async () => {
        const result = await sb
          // eslint-disable-next-line no-restricted-syntax -- Audited: queue worker uses privileged client; gated by INTERNAL_API_TOKEN
          .from("affiliate_clicks")
          .upsert(rows, { onConflict: "click_id", ignoreDuplicates: true });
        if (result.error) {
          throw new Error(result.error.message);
        }
      });
    } catch (cbErr) {
      if (cbErr instanceof CircuitOpenError) throw cbErr;
      upsertError = cbErr as Error;
    }

    if (upsertError) {
      captureException(upsertError, { context: "[api/queue/clicks] upsert" });
      if (anyMsgId) {
        const allFailed = unwrapped
          .map((u) => u.msgId)
          .filter((id): id is string => typeof id === "string");
        return NextResponse.json(
          { error: "DB insert failed", acked: [], failed: allFailed },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }

    if (anyMsgId) {
      // audit5-#13: every validated message was upserted; the conflict-
      // ignore semantics mean a duplicate insert is still "acked" from
      // the worker's perspective (Cloudflare Queues should drop the
      // queue message regardless).
      for (const u of validUnwrapped) {
        if (u.msgId) ackedIds.push(u.msgId);
      }
      return NextResponse.json({
        ok: true,
        inserted: rows.length,
        rejected: rejectedCount,
        acked: ackedIds,
        failed: failedIds,
      });
    }
    return NextResponse.json({ ok: true, inserted: rows.length, rejected: rejectedCount });
  } catch (err) {
    // S9-H2: When the circuit breaker is open, return 500 so Cloudflare
    // Queues backs off with exponential retry and eventually routes to DLQ.
    if (err instanceof CircuitOpenError) {
      logger.warn("click_queue_circuit_open", {
        breaker: "supabase-clicks",
        metrics: supabaseClicksBreaker.metrics(),
      });
      return NextResponse.json(
        { error: "Service temporarily unavailable", reason: "circuit_breaker_open" },
        { status: 500 },
      );
    }
    captureException(err, { context: "[api/queue/clicks] POST" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
