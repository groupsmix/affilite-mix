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
import { captureException } from "@/lib/sentry";

// Minimal structural type for the Queue binding — avoids pulling in
// @cloudflare/workers-types as a project dependency.
interface CloudflareQueue<T> {
  send(message: T): Promise<void>;
  sendBatch(messages: Array<{ body: T }>): Promise<void>;
}

export interface ClickQueueMessage extends RecordClickInput {
  /** Epoch millis when the click was received at the edge. */
  ts: number;
}

function getClickQueue(): CloudflareQueue<ClickQueueMessage> | undefined {
  // Check globalThis first so tests can inject a mock via vi.stubGlobal;
  // fall back to the @opennextjs/cloudflare process.env shim in production.
  const fromGlobal = (globalThis as Record<string, unknown>).CLICK_QUEUE;
  const candidate =
    fromGlobal !== undefined
      ? fromGlobal
      : (() => {
          try {
            return (process.env as Record<string, unknown>).CLICK_QUEUE;
          } catch {
            return undefined;
          }
        })();

  if (candidate && typeof candidate === "object" && "send" in candidate) {
    return candidate as unknown as CloudflareQueue<ClickQueueMessage>;
  }
  return undefined;
}

/**
 * Publish a click to the tracking queue, or write it directly when the
 * queue binding is not available. Errors are captured and swallowed —
 * clicks are best-effort analytics.
 */
export async function publishClick(input: RecordClickInput): Promise<void> {
  const queue = getClickQueue();
  const payload: ClickQueueMessage = { ...input, ts: Date.now() };

  if (queue) {
    try {
      await queue.send(payload);
      return;
    } catch (err) {
      captureException(err, { context: "click-queue.send" });
      // Fall through to direct write so we don't lose the click
    }
  }

  try {
    await recordClick(input);
  } catch (err) {
    captureException(err, { context: "click-queue.direct-write" });
  }
}
