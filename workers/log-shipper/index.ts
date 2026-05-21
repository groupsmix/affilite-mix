/**
 * Tail Worker — durable observability sink for the main affilite-mix
 * Cloudflare Worker.
 *
 * Audit R-008: the production-readiness re-audit flagged that
 * `wrangler.jsonc` declares observability but `tail_consumers` is
 * empty, so Worker logs (cron failures, queue DLQ growth, 5xx spikes,
 * auth failures, migration errors) are only visible in the dashboard
 * for a short window with no alerting. This Worker fixes that:
 *
 *   1. It subscribes to the main Worker's tail stream
 *      (configured via `tail_consumers` in the parent wrangler.jsonc).
 *   2. Each batch is JSON-line encoded and appended to R2 under
 *      `logs/<yyyy>/<mm>/<dd>/<isoTs>-<rand>.jsonl`.
 *   3. Events whose level is `error` (or that match alert keywords)
 *      are also POSTed to ALERT_WEBHOOK_URL when configured (e.g. a
 *      PagerDuty / Slack inbound URL).
 *
 * The shipper is intentionally minimal so it cannot itself become an
 * incident; if R2 or the alert sink fail it logs the failure to the
 * native Worker tail and lets Cloudflare retry.
 */

interface CloudflareTailEvent {
  scriptName?: string;
  outcome: "ok" | "exception" | "exceededCpu" | "canceled" | "unknown";
  eventTimestamp?: number;
  event?: unknown;
  logs?: Array<{ level: string; message: unknown[]; timestamp: number }>;
  exceptions?: Array<{ name: string; message: string; timestamp: number }>;
}

interface TailWorkerEnv {
  LOG_SINK: R2Bucket;
  ALERT_WEBHOOK_URL?: string;
  ALERT_WEBHOOK_TOKEN?: string;
}

// Minimal R2 type stubs so this file typechecks under the project
// tsconfig without pulling in @cloudflare/workers-types.
interface R2Bucket {
  put(key: string, value: string | ArrayBuffer | Uint8Array): Promise<unknown>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const ALERT_KEYWORDS = [
  "[scheduled]", // cron failures
  "[queue/", // queue / DLQ failures
  "Health check:", // health-check errors
  "audit/security",
];

function shouldAlert(event: CloudflareTailEvent): boolean {
  if (event.outcome === "exception" || event.outcome === "exceededCpu") return true;
  if (event.exceptions && event.exceptions.length > 0) return true;
  for (const log of event.logs ?? []) {
    if (log.level === "error" || log.level === "fatal") return true;
    const flat = log.message.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ");
    if (ALERT_KEYWORDS.some((k) => flat.includes(k))) return true;
  }
  return false;
}

function buildKey(): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 10);
  return `logs/${yyyy}/${mm}/${dd}/${iso}-${rand}.jsonl`;
}

async function postAlert(env: TailWorkerEnv, payload: CloudflareTailEvent): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.ALERT_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        source: "affilite-mix-log-shipper",
        outcome: payload.outcome,
        eventTimestamp: payload.eventTimestamp,
        exceptions: payload.exceptions,
        logs: payload.logs,
      }),
    });
  } catch (err) {
    // Never throw from a tail worker — Cloudflare drops the batch.
    console.error("[log-shipper] alert webhook failed:", err);
  }
}

const logShipper = {
  async tail(events: CloudflareTailEvent[], env: TailWorkerEnv, ctx: ExecutionContext) {
    if (!events.length) return;

    const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const key = buildKey();

    ctx.waitUntil(
      env.LOG_SINK.put(key, body).catch((err) => {
        console.error("[log-shipper] R2 put failed:", err);
      }),
    );

    for (const event of events) {
      if (shouldAlert(event)) {
        ctx.waitUntil(postAlert(env, event));
      }
    }
  },
};

export default logShipper;
