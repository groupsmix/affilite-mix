import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
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

function isValidMessage(
  m: ClickMessage,
): m is Required<Pick<ClickMessage, "site_id" | "product_name" | "affiliate_url">> & ClickMessage {
  return (
    typeof m.site_id === "string" &&
    m.site_id.length > 0 &&
    typeof m.product_name === "string" &&
    typeof m.affiliate_url === "string" &&
    m.affiliate_url.length > 0
  );
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

  let body: QueueBody;
  try {
    body = (await request.json()) as QueueBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const rows = messages.filter(isValidMessage).map((m) => {
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
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  try {
    const sb = getServiceClient();
    // Use upsert with ignoreDuplicates so retried queue messages with the
    // same click_id are silently skipped (ON CONFLICT (click_id) DO NOTHING).
    const { error } = await sb
      .from("affiliate_clicks")
      .upsert(rows, { onConflict: "click_id", ignoreDuplicates: true });
    if (error) {
      captureException(new Error(error.message), { context: "[api/queue/clicks] upsert" });
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err) {
    captureException(err, { context: "[api/queue/clicks] POST" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
