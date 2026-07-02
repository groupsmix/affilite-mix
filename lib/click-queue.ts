/**
 * F-028: Cloudflare Queue producer for click tracking.
 *
 * Wraps the CLICK_QUEUE binding so callers can publish click events without
 * touching Cloudflare-specific types. When the binding is absent (local dev
 * or a deployment that hasn't provisioned the queue yet) `publishClick()`
 * falls back to writing directly to Supabase — preserving the pre-queue
 * behaviour instead of silently dropping clicks.
 */

import { recordClick, type RecordClickInput } from "@/lib/dal/affiliate-clicks";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { randomUUID } from "node:crypto";
import { getClickQueue as getRuntimeClickQueue, readGlobalBinding } from "@/lib/runtime-env";
import { emitMetric } from "@/lib/metrics";

// The privileged Supabase client wraps every PostgREST builder in a Proxy
// (see `lib/server-only/service-role.ts`) that exposes a runtime-only
// `unsafeNoSiteFilter()` opt-out for cross-tenant operations. The method
// is not part of the upstream `@supabase/supabase-js` types, so we declare
// the minimal shape we need here.
type SiteFilterOptOut<T> = T & { unsafeNoSiteFilter(): PromiseLike<T> };

async function logClickFailure(payload: RecordClickInput, errorMessage: string): Promise<void> {
  try {
    const sb = getPrivilegedSupabaseClient();
    // click_failures has no top-level site_id column (site_id lives inside the
    // jsonb `payload`). The privileged-client proxy enforces a site_id filter
    // by default, so we explicitly opt out for this cross-tenant DLQ table.
    const insertBuilder = sb.from("click_failures").insert({
      payload: { ...payload, _error: errorMessage } as unknown as import("@/types/supabase").Json,
      error_message: errorMessage,
    });
    await (insertBuilder as SiteFilterOptOut<typeof insertBuilder>).unsafeNoSiteFilter();
  } catch (err) {
    captureException(err, { context: "click-queue.log-failure" });
  }
}

// Minimal structural type for the Queue binding — avoids pulling in
// @cloudflare/workers-types as a project dependency.
interface CloudflareQueue<T> {
  send(message: T): Promise<void>;
  sendBatch(messages: Array<{ body: T }>): Promise<void>;
}

interface ClickQueueMessage extends RecordClickInput {
  /** Epoch millis when the click was received at the edge. */
  ts: number;
}

const CLICK_QUEUE_MAX_ATTEMPTS = 3;
const CLICK_QUEUE_BASE_BACKOFF_MS = 100;

function isProductionWorkerRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(
  queue: CloudflareQueue<ClickQueueMessage>,
  payload: ClickQueueMessage,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLICK_QUEUE_MAX_ATTEMPTS; attempt++) {
    try {
      await queue.send(payload);
      return;
    } catch (err) {
      lastError = err;
      captureException(err, {
        context: "click-queue.send",
        extra: { attempt, maxAttempts: CLICK_QUEUE_MAX_ATTEMPTS },
      });
      if (attempt < CLICK_QUEUE_MAX_ATTEMPTS) {
        await sleep(CLICK_QUEUE_BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("click queue send failed");
}

async function alertClickTotalLoss(
  input: RecordClickInput,
  reason: string,
  err?: unknown,
): Promise<void> {
  emitMetric("click_queue_total_loss", 1, {
    error_type: reason,
    site_id: input.site_id,
  });
  logger.error("[click-queue] Click could not be queued after retries; persisted to DLQ", {
    reason,
    site_id: input.site_id,
    product_name: input.product_name,
  });
  captureException(err ?? new Error(reason), {
    context: "click-queue.total-loss",
    extra: { site_id: input.site_id, reason },
  });
}

function getClickQueue(): CloudflareQueue<ClickQueueMessage> | undefined {
  // Check globalThis first so tests can inject a mock via vi.stubGlobal;
  // fall back to the runtime-env typed accessor in production. The accessor
  // wraps the @opennextjs/cloudflare `process.env` shim and validates the
  // shape, so we don't need the historical inline `typeof object && 'send' in`
  // dance here.
  const fromGlobal = readGlobalBinding<CloudflareQueue<ClickQueueMessage>>("CLICK_QUEUE", "send");
  if (fromGlobal) return fromGlobal;
  try {
    const q = getRuntimeClickQueue();
    if (q) return q as CloudflareQueue<ClickQueueMessage>;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return undefined;
  }
  return undefined;
}

/**
 * Publish a click to the tracking queue, or write it directly when the
 * queue binding is not available. Errors are captured and swallowed —
 * clicks are best-effort analytics.
 */
export async function publishClick(input: RecordClickInput): Promise<void> {
  // F-BIZ-01: Ensure click_id is strictly server-generated at the edge.
  // We ignore any client-supplied click_id to prevent replay/suppression attacks.
  const clickId = randomUUID();
  const enriched: RecordClickInput = { ...input, click_id: clickId };
  const queue = getClickQueue();
  const payload: ClickQueueMessage = { ...enriched, ts: Date.now() };

  if (queue) {
    try {
      await sendWithRetry(queue, payload);
      return;
    } catch (err) {
      // Do not fall through to direct write in production to prevent slamming Supabase;
      // instead log to click_failures for reconciliation.
      if (isProductionWorkerRuntime()) {
        await logClickFailure(enriched, "queue.send failed after retries");
        await alertClickTotalLoss(enriched, "queue_send_failed", err);
        return;
      }
    }
  } else {
    if (isProductionWorkerRuntime()) {
      logger.error(
        "[click-queue] Queue binding missing in production. Logging click failure for reconciliation.",
      );
      await logClickFailure(enriched, "CLICK_QUEUE binding missing");
      await alertClickTotalLoss(enriched, "queue_binding_missing");
      return;
    }
  }

  try {
    await recordClick(enriched, getPrivilegedSupabaseClient);
  } catch (err) {
    captureException(err, { context: "click-queue.direct-write" });
  }
}
