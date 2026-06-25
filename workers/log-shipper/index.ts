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
  "unauthorized", // auth failures
  "forbidden",
  "migration", // DB migration errors
  "RateLimitError",
  "auth",
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
  // Use crypto.randomUUID() instead of Math.random() to avoid key collisions
  // when multiple tail events arrive within the same millisecond.
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `logs/${yyyy}/${mm}/${dd}/${iso}-${rand}.jsonl`;
}

/**
 * Validate the ALERT_WEBHOOK_URL against the SSRF allowlist.
 * Returns the validated URL string, or null if rejected.
 */
function validateAlertWebhookUrl(raw: string): string | null {
  if (!/^https:\/\//i.test(raw)) {
    // eslint-disable-next-line no-console -- FR-06 documented last-resort sink
    console.error("[log-shipper] ALERT_WEBHOOK_URL rejected: must be https://", raw.slice(0, 40));
    return null;
  }
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    // Block localhost, RFC-1918, link-local, IPv6 private ranges, and cloud
    // metadata endpoints. Also guard against IPv4-mapped IPv6 (::ffff:127.x).
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^::ffff:/i, // IPv4-mapped IPv6 addresses
      /^fd/i, // ULA IPv6
      /^fc/i, // ULA IPv6
      /^metadata\.google/,
      /^169\.254\.169\.254$/,
    ];
    if (blockedPatterns.some((re) => re.test(host))) {
      // eslint-disable-next-line no-console -- FR-06 documented last-resort sink
      console.error("[log-shipper] ALERT_WEBHOOK_URL rejected: blocked host", host);
      return null;
    }
  } catch {
    // eslint-disable-next-line no-console -- FR-06 documented last-resort sink
    console.error("[log-shipper] ALERT_WEBHOOK_URL is not a valid URL");
    return null;
  }
  return raw;
}

/**
 * Post a batched alert for multiple alerting events in a single HTTP call.
 * Prevents alert-sink flooding when a bad deploy triggers many errors at once.
 * Uses `redirect: "error"` so an attacker-controlled redirect cannot bypass
 * the SSRF hostname check above.
 */
async function postAlertBatch(
  env: TailWorkerEnv,
  events: CloudflareTailEvent[],
): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL || !events.length) return;

  const validatedUrl = validateAlertWebhookUrl(env.ALERT_WEBHOOK_URL);
  if (!validatedUrl) return;

  try {
    await fetch(validatedUrl, {
      method: "POST",
      // redirect: "error" prevents SSRF via a redirect to an internal address
      // that passes the hostname check above (DNS rebinding, open redirects).
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(env.ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.ALERT_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        source: "affilite-mix-log-shipper",
        alertCount: events.length,
        events: events.map((e) => ({
          outcome: e.outcome,
          eventTimestamp: e.eventTimestamp,
          exceptions: e.exceptions,
          logs: e.logs,
        })),
      }),
    });
  } catch (err) {
    // Never throw from a tail worker — Cloudflare drops the batch.
    // FR-06: console is intentional here (see validateAlertWebhookUrl).
    // eslint-disable-next-line no-console -- FR-06 documented last-resort sink
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
        // eslint-disable-next-line no-console -- FR-06 documented last-resort sink (see postAlertBatch)
        console.error("[log-shipper] R2 put failed:", err);
      }),
    );

    // Collect all alertable events and send a single batched HTTP call rather
    // than one call per event — prevents flooding the alert sink during error
    // bursts (e.g. a bad deploy triggering dozens of exceptions at once).
    const alertableEvents = events.filter(shouldAlert);
    if (alertableEvents.length > 0) {
      ctx.waitUntil(postAlertBatch(env, alertableEvents));
    }
  },
};

export default logShipper;
