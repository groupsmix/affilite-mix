# Click DLQ runbook

> **Audit reference:** G-26. Pairs with `scripts/drain-dlq.ts`.

This runbook describes how to triage and replay messages that ended up in
the click-tracking dead-letter queue. The goal is to recover affiliate
attribution evidence after a transient downstream failure (most commonly a
Supabase outage or schema drift) without losing data and without
double-counting clicks.

## How clicks reach the DLQ

```
                     ┌──────────────────────┐
   POST /api/track   │   CLICK_QUEUE        │
   ────────────────▶ │   (click-tracking)   │
                     └──────────┬───────────┘
                                │  consumer in
                                │  workers/custom-worker.ts
                                ▼
                     ┌──────────────────────────────┐
                     │  POST /api/queue/clicks      │
                     │  → upsert affiliate_clicks   │
                     └──────────┬───────────────────┘
                                │  3 retries (max_retries: 3 in
                                │  wrangler.jsonc)
                                ▼
                     ┌──────────────────────┐
                     │ click-tracking-dlq   │  Cloudflare Queue (DLQ binding)
                     └──────────┬───────────┘
                                │  consumer in custom-worker.ts
                                │  POSTs to /api/queue/clicks?dlq=true
                                ▼
                     ┌──────────────────────┐
                     │ public.click_failures│  durable Postgres sink
                     └──────────────────────┘
```

The DLQ message bodies are persisted into `public.click_failures` with
the original payload stored in the `payload` jsonb column (migration
`00039_create_click_failures.sql`). `scripts/drain-dlq.ts` reads from
that table — operators do not interact with the Cloudflare Queue
directly.

The `/api/cron/click-reconcile` job already alarms when the failure
count exceeds threshold or the loss rate climbs above 5%. **A reconcile
alarm is the trigger to run this runbook.**

## Detection

You should suspect a DLQ buildup when any of the following happen:

- Sentry fires `[api/queue/clicks] DLQ processing` events.
- The `Click loss alarm` Sentry event from `/api/cron/click-reconcile`
  fires (`docs/alerting-runbook.md` covers paging policy).
- A scheduled spot-check via:
  ```bash
  npm run drain-dlq -- list --limit 10
  ```

## Triage decision tree

1. **Is the underlying cause already fixed?**
   The `error_message` column on each row is the failure reason captured
   by the queue consumer (`"DLQ message"` is the default; older code
   paths may include the upstream error string).
   - If the cause is **not yet fixed** (e.g. Supabase still returning 5xx
     for the affected `site_id`), **stop**. Replaying now will just push
     the messages straight back into the DLQ.
   - If the cause **is** fixed, continue to step 2.

2. **Sample the backlog.** Always start with `list` to make sure the
   payload shapes look sane before you replay anything:

   ```bash
   npm run drain-dlq -- list --limit 50
   ```

   Look for:
   - Unexpected `site_id` values (especially missing UUIDs).
   - `affiliate_url` values that aren't `http(s)`.
   - Wildly stale `created_at` timestamps that you may want to drop
     instead of replay.

3. **Dry-run a replay.** This validates payload shapes and prints the
   batch plan without making any changes:

   ```bash
   npm run drain-dlq -- replay --limit 100 --dry-run
   ```

   Confirm that `prefiltered (bad)` is 0 (or expected) before continuing.

4. **Replay for real.** Pick a batch size you are comfortable with — the
   route caps each request at 200 messages, and the script chunks
   automatically:

   ```bash
   npm run drain-dlq -- replay --limit 200
   ```

   Re-run until the `total fetched` line reports `0`.

5. **Purge stale residue.** Anything that has aged past your retention
   window without being replayable (e.g. permanently malformed payloads
   from a since-fixed bug) can be evicted:
   ```bash
   npm run drain-dlq -- purge --older-than-days 30 --dry-run
   npm run drain-dlq -- purge --older-than-days 30
   ```

## Operational notes

- **Idempotency.** `/api/queue/clicks` upserts with
  `onConflict: "click_id"` and `ignoreDuplicates: true`, so messages
  carrying a `click_id` are safe to replay multiple times. Messages
  without a `click_id` (legacy fields, very old rows) will be inserted
  again — prefer `purge` over `replay` for those.
- **Deletion happens only after a 2xx replay.** If a batch returns a
  non-2xx, the script logs the response body, skips the delete, and
  exits with code `2` so CI/automation can detect partial failure. The
  remaining rows stay in `click_failures` and the next invocation picks
  them up.
- **Dry-run is non-destructive everywhere.** It performs all reads but
  no POSTs and no DELETEs; safe to run from a workstation against
  production.
- **Auth.** The script signs requests with the same INTERNAL_API_TOKEN
  HMAC scheme the production worker uses (`lib/internal-hmac.ts`), so
  the route accepts replays without any new credentials. Make sure
  `INTERNAL_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, and
  `SUPABASE_SERVICE_ROLE_KEY` are all set in your shell before running
  `replay` or `purge`. `list` only needs the Supabase pair.
- **Targeting a specific environment.** The replay POST goes to
  `${APP_URL}/api/queue/clicks` by default. Override with
  `--target https://staging.example.com` when re-running against a
  preview deployment.

## Recovering a specific incident window

When an outage spanned a known time window, restrict the replay to that
window so unrelated background failures aren't dragged in:

```bash
npm run drain-dlq -- replay --since 2026-04-29T01:00:00Z --limit 500
```

## Escalation

If `replay` keeps returning HTTP 5xx after the underlying outage is
declared resolved:

1. Check `/api/queue/clicks` server logs for the latest stack trace.
2. Verify `INTERNAL_API_TOKEN` is the same in the worker, the local
   shell, and the route's environment.
3. Confirm `INTERNAL_HMAC_MIGRATION_MODE` is not `strict` if you are
   replaying from a workstation with clock skew — bumping NTP usually
   fixes the `Timestamp skew ...ms exceeds ...ms` rejection.
4. Open an incident referencing G-26 and attach the `--json` output of
   the failing run.
