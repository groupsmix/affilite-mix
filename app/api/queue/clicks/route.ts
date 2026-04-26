import { NextRequest, NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { getInternalToken } from "@/lib/internal-auth";
import { captureException } from "@/lib/sentry";

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

interface ClickMessage {
  site_id?: string;
  product_name?: string;
  affiliate_url?: string;
  content_slug?: string;
  referrer?: string;
  click_id?: string;
  ts?: number;
}

interface QueueBody {
  messages?: ClickMessage[];
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

function isHttpUrl(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
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
    expected = getInternalToken();
  } catch {
    return NextResponse.json({ error: "Internal auth misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (bearer !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isDlq = request.nextUrl.searchParams.get("dlq") === "true";

  let body: QueueBody;
  try {
    body = (await request.json()) as QueueBody;
  } catch {
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
    const sb = getPrivilegedSupabaseClient();

    if (isDlq) {
      // F-024: DLQ messages are persisted to click_failures for durable recovery
      const dlqRows = messages.map((m) => ({
        payload: m,
        error_message: "DLQ message",
      }));

      const { error } = await sb.from("click_failures" as any).insert(dlqRows);
      if (error) {
        captureException(new Error(`Failed to persist DLQ messages: ${error.message}`), {
          context: "[api/queue/clicks] DLQ",
        });
        return NextResponse.json({ error: "DLQ insert failed" }, { status: 500 });
      }

      // Alert on DLQ rate (triggers Sentry)
      captureException(new Error(`Processed ${dlqRows.length} dead letter queue messages`), {
        context: "[api/queue/clicks] DLQ processing",
      });

      return NextResponse.json({ ok: true, inserted: dlqRows.length });
    }

    const validMessages = messages.filter(isValidMessage);
    const rejectedCount = messages.length - validMessages.length;
    if (rejectedCount > 0) {
      // F-014: structured rejection metric. We never throw on rejected
      // messages because Cloudflare Queues retries the *whole* batch on
      // 5xx, which would just replay the bad messages. Logging via
      // captureException routes them to Sentry with the count attached.
      captureException(
        new Error(`[api/queue/clicks] dropped ${rejectedCount} invalid message(s)`),
        { context: "[api/queue/clicks] validation" },
      );
    }

    const rows = validMessages.map((m) => {
      const row: Record<string, unknown> = {
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
      return NextResponse.json({ ok: true, inserted: 0, rejected: rejectedCount });
    }

    // Use upsert with ignoreDuplicates so retried queue messages with the
    // same click_id are silently skipped (ON CONFLICT (click_id) DO NOTHING).
    const { error } = await sb
      .from("affiliate_clicks")
      .upsert(rows, { onConflict: "click_id", ignoreDuplicates: true });
    if (error) {
      captureException(new Error(error.message), { context: "[api/queue/clicks] upsert" });
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: rows.length, rejected: rejectedCount });
  } catch (err) {
    captureException(err, { context: "[api/queue/clicks] POST" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
