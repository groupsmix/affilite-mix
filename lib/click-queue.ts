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
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

// The privileged Supabase client wraps every PostgREST builder in a Proxy
// (see `lib/server-only/service-role.ts`) that exposes a runtime-only
// `unsafeNoSiteFilter()` opt-out for cross-tenant operations. The method
// is not part of the upstream `@supabase/supabase-js` types, so we declare
// the minimal shape we need here.
type SiteFilterOptOut<T> = T & { unsafeNoSiteFilter(): PromiseLike<T> };

async function logClickFailure(payload: RecordClickInput, errorMessage: string): Promise<void> {
  // A99/A100 audit fix: Avoid writing to the database synchronously when the queue
  // is down, to prevent exhausting connection pools and cascading failures.
  // Instead, we log the failure to Sentry and gracefully drop the click.
  captureException(new Error(errorMessage), {
    context: "click-queue.log-failure",
    extra: { payload },
  });
}

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
  // A158: Anti-Abuse IP Rate Limiting to prevent self-referral / click floods
  if (input.ip_address) {
    const rlKey = `click:${input.site_id}:${input.ip_address}`;
    const rl = await checkRateLimit(rlKey, {
      maxRequests: 15,
      windowMs: 60_000,
      failPolicy: "open", // Don't block analytics if rate limiter is down
    });
    if (!rl.allowed) {
      logger.warn("Click rate limit exceeded for IP, dropping click to prevent fraud", {
        ip: input.ip_address,
        siteId: input.site_id,
      });
      return;
    }
  }

  // F-BIZ-01: Ensure click_id is strictly server-generated at the edge.
  // We ignore any client-supplied click_id to prevent replay/suppression attacks.
  const clickId = randomUUID();
  const enriched: RecordClickInput = { ...input, click_id: clickId };
  const queue = getClickQueue();
  const payload: ClickQueueMessage = { ...enriched, ts: Date.now() };

  if (queue) {
    try {
      await queue.send(payload);
      return;
    } catch (err) {
      captureException(err, { context: "click-queue.send" });
      // Do not fall through to direct write in production to prevent slamming Supabase;
      // instead log to click_failures for reconciliation.
      if (
        process.env.NODE_ENV === "production" ||
        (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers")
      ) {
        void logClickFailure(enriched, "queue.send failed");
        return;
      }
    }
  } else {
    if (
      process.env.NODE_ENV === "production" ||
      (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers")
    ) {
      logger.error(
        "[click-queue] Queue binding missing in production. Logging click failure for reconciliation.",
      );
      void logClickFailure(enriched, "CLICK_QUEUE binding missing");
      return;
    }
  }

  try {
    await recordClick(enriched, getPrivilegedSupabaseClient);
  } catch (err) {
    captureException(err, { context: "click-queue.direct-write" });
  }
}
