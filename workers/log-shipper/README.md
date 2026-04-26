# `affilite-mix-log-shipper` (Tail Worker)

Audit R-008: durable Worker observability.

This Worker is **not** part of the main app deploy. It runs separately
and subscribes to the main Worker's `tail` stream so every log line,
exception, cron failure, queue DLQ event, and 5xx is preserved in R2
and (optionally) fanned out to a paging webhook.

## What it captures

- Every Worker invocation outcome (`ok`, `exception`, `exceededCpu`,
  `canceled`).
- All `console.*` logs, with level metadata.
- All thrown exceptions, with class name + stack.

The retention is governed by R2's lifecycle policy on the
`affilite-mix-logs` bucket — set this to your compliance requirement
(default 365 days for SOC2 audit-trail evidence; see
`docs/compliance-evidence.md`).

## What triggers an alert

`shouldAlert(event)` matches:

- Any event with an `exception` outcome (Worker threw uncaught) or
  `exceededCpu` (we hit Cloudflare's CPU budget).
- Any structured exception in `event.exceptions[]`.
- Any `console.error` / `console.fatal`.
- Substring matches on the high-signal prefixes used elsewhere in the
  app:
  - `[scheduled]` — cron dispatcher errors.
  - `[queue/` — queue consumer or DLQ persistence errors.
  - `Health check:` — `/api/health` failures.
  - `audit/security` — security event sinks.

## One-time setup

```bash
# 1. Create the durable log bucket (do this once per environment).
npx wrangler r2 bucket create affilite-mix-logs

# 2. (optional) configure the paging webhook so the shipper can fan out alerts.
echo "$PAGER_DUTY_INBOUND_URL" | \
  npx wrangler secret put ALERT_WEBHOOK_URL \
    --config workers/log-shipper/wrangler.jsonc
echo "$PAGER_DUTY_TOKEN" | \
  npx wrangler secret put ALERT_WEBHOOK_TOKEN \
    --config workers/log-shipper/wrangler.jsonc

# 3. Deploy the shipper.
npx wrangler deploy --config workers/log-shipper/wrangler.jsonc

# 4. Subscribe the main worker. Edit `wrangler.jsonc` in the repo root
#    and set:
#      "tail_consumers": [
#        { "service": "affilite-mix-log-shipper" }
#      ]
#    Then redeploy main as usual.
```

## Verifying

After deploy, generate a deliberate log line on the main worker and
confirm it shows up in R2 under
`logs/<yyyy>/<mm>/<dd>/<isoTs>-<rand>.jsonl`. The `__tests__/log-shipper`
suite exercises `shouldAlert` against representative tail events.

## Alternative sinks

Instead of (or in addition to) R2, the shipper can `fetch()` to:

- **Logtail**: `https://in.logtail.com` with a token.
- **Datadog**: `https://http-intake.logs.datadoghq.com/api/v2/logs` with
  a DD-API-KEY header.
- **Splunk HEC**: `https://<host>:8088/services/collector/event` with
  the HEC token.
- **Cloudflare Logpush** (Enterprise): bypasses this Worker entirely
  and pushes Worker Trace Events directly to R2/S3/Datadog/Splunk.

Pick one when you uncomment `postAlert` for your environment.
