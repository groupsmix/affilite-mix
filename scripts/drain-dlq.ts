#!/usr/bin/env tsx
/**
 * G-26: Click DLQ replay tooling.
 *
 * Drains the durable click DLQ sink (`public.click_failures`) by listing,
 * replaying, or purging entries.  The Cloudflare Queue dead-letter
 * messages for `click-tracking-dlq` are persisted into this table by
 * `workers/custom-worker.ts` (via `POST /api/queue/clicks?dlq=true`),
 * which is the durable parachute for clicks that the main consumer
 * could not process within `max_retries`.  Once the underlying cause
 * (Supabase outage, schema drift, validation gap, etc.) is resolved,
 * an operator runs this tool to re-publish the rescued messages back
 * through the normal queue-consumer path so attribution is recovered.
 *
 * Usage:
 *
 *   npm run drain-dlq -- list                 # default; peek pending entries
 *   npm run drain-dlq -- replay               # POST batched messages back to /api/queue/clicks
 *   npm run drain-dlq -- purge --older-than-days 30
 *
 * Common flags:
 *   --limit <n>         Cap rows fetched per run (default: 100, max: 500).
 *   --since <iso>       Only consider rows with created_at >= ISO timestamp.
 *   --dry-run           Do everything except the destructive step (replay POST or DELETE).
 *   --target <url>      Origin to POST replays to (required for replay unless APP_URL is set).
 *   --json              Emit machine-readable output (default: human-readable).
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (always)
 *   INTERNAL_API_TOKEN                                    (replay only)
 *
 * Exit codes:
 *   0  success (or dry-run preview produced)
 *   1  CLI / env / arg error
 *   2  partial replay failure (some batches did not 2xx — re-run or investigate)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildInternalHmacContext, signInternalRequest } from "../lib/internal-hmac";

interface CliArgs {
  command: "list" | "replay" | "purge" | "help";
  limit: number;
  since?: string;
  olderThanDays?: number;
  dryRun: boolean;
  target?: string;
  json: boolean;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/** Mirrors MAX_MESSAGES_PER_BATCH in app/api/queue/clicks/route.ts. */
const REPLAY_BATCH_SIZE = 200;

interface ClickFailureRow {
  id: string;
  payload: unknown;
  error_message: string | null;
  created_at: string;
}

interface ClickMessage {
  site_id?: unknown;
  product_name?: unknown;
  affiliate_url?: unknown;
  content_slug?: unknown;
  referrer?: unknown;
  click_id?: unknown;
  ts?: unknown;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "help",
    limit: DEFAULT_LIMIT,
    dryRun: false,
    target: process.env.APP_URL?.replace(/\/+$/, ""),
    json: false,
  };

  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = argv.filter((a) => a.startsWith("--"));

  if (positional.length === 0 || positional[0] === "help") {
    args.command = "help";
    return args;
  }
  const cmd = positional[0];
  if (cmd !== "list" && cmd !== "replay" && cmd !== "purge") {
    throw new Error(`Unknown command: ${cmd}. Use list | replay | purge | help.`);
  }
  args.command = cmd;

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === "--dry-run") {
      args.dryRun = true;
    } else if (flag === "--json") {
      args.json = true;
    } else if (flag!.startsWith("--limit")) {
      const value = flag!.includes("=") ? flag!.split("=")[1] : flags[++i];
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit must be a positive number, got: ${value}`);
      }
      args.limit = Math.min(Math.floor(n), MAX_LIMIT);
    } else if (flag!.startsWith("--since")) {
      const value = flag!.includes("=") ? flag!.split("=")[1] : flags[++i];
      if (!value || Number.isNaN(Date.parse(value))) {
        throw new Error(`--since must be an ISO timestamp, got: ${value}`);
      }
      args.since = new Date(value).toISOString();
    } else if (flag!.startsWith("--older-than-days")) {
      const value = flag!.includes("=") ? flag!.split("=")[1] : flags[++i];
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--older-than-days must be a positive number, got: ${value}`);
      }
      args.olderThanDays = Math.floor(n);
    } else if (flag!.startsWith("--target")) {
      const value = flag!.includes("=") ? flag!.split("=")[1] : flags[++i];
      if (!value || !/^https?:\/\//.test(value)) {
        throw new Error(`--target must be an http(s) URL, got: ${value}`);
      }
      args.target = value.replace(/\/+$/, "");
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function printHelp(): void {
  // The leading newline keeps the output readable when invoked via `npm run -- ...`
  // which prepends its own banner.
  process.stdout.write(
    [
      "",
      "drain-dlq — replay or inspect messages persisted in click_failures.",
      "",
      "  npm run drain-dlq -- list   [--limit N] [--since ISO] [--json]",
      "  npm run drain-dlq -- replay [--limit N] [--since ISO] [--target URL] [--dry-run] [--json]",
      "  npm run drain-dlq -- purge  --older-than-days N [--dry-run] [--json]",
      "",
      "See docs/runbooks/click-dlq.md for the full operational runbook.",
      "",
    ].join("\n"),
  );
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchFailures(sb: SupabaseClient, args: CliArgs): Promise<ClickFailureRow[]> {
  let query = sb
    .from("click_failures")
    .select("id,payload,error_message,created_at")
    .order("created_at", { ascending: true })
    .limit(args.limit);
  if (args.since) {
    query = query.gte("created_at", args.since);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`click_failures select failed: ${error.message}`);
  }
  return (data ?? []) as ClickFailureRow[];
}

/**
 * The route validates each message at the schema level. We mirror just
 * enough of that validation here so we can report which rows would be
 * dropped on replay before they are POSTed.  Rows that fail this
 * pre-flight are surfaced in the summary but still POSTed (the route
 * silently drops them and persists them back to click_failures, which
 * is the exact same state they are in now — replay is therefore safe).
 */
function looksReplayable(payload: unknown): payload is ClickMessage {
  if (!payload || typeof payload !== "object") return false;
  const m = payload as ClickMessage;
  if (typeof m.site_id !== "string") return false;
  if (typeof m.product_name !== "string" || m.product_name.length === 0) return false;
  if (typeof m.affiliate_url !== "string" || m.affiliate_url.length === 0) return false;
  return true;
}

async function postReplayBatch(
  args: CliArgs,
  messages: ClickMessage[],
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    throw new Error("INTERNAL_API_TOKEN must be set to replay messages.");
  }
  if (!args.target) throw new Error("Replay target is required.");
  const url = `${args.target}/api/queue/clicks`;
  const bodyText = JSON.stringify({ messages });
  const headers = await signInternalRequest(
    token,
    bodyText,
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // audit #7: bind the operation (replay posts to the normal queue path).
    buildInternalHmacContext("POST", url),
  );
  const res = await fetch(url, { method: "POST", headers, body: bodyText });
  const responseText = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, bodyText: responseText };
}

interface ReplayResult {
  total: number;
  prefilteredOut: number;
  posted: number;
  acknowledged: number;
  failedBatches: number;
  deleted: number;
}

async function replay(sb: SupabaseClient, args: CliArgs): Promise<ReplayResult> {
  const rows = await fetchFailures(sb, args);
  const total = rows.length;

  const replayable: ClickFailureRow[] = [];
  let prefilteredOut = 0;
  for (const row of rows) {
    if (looksReplayable(row.payload)) {
      replayable.push(row);
    } else {
      prefilteredOut++;
    }
  }

  if (args.dryRun) {
    return {
      total,
      prefilteredOut,
      posted: replayable.length,
      acknowledged: 0,
      failedBatches: 0,
      deleted: 0,
    };
  }

  let posted = 0;
  let acknowledged = 0;
  let failedBatches = 0;
  let deleted = 0;

  for (let i = 0; i < replayable.length; i += REPLAY_BATCH_SIZE) {
    const slice = replayable.slice(i, i + REPLAY_BATCH_SIZE);
    const messages = slice.map((row) => row.payload as ClickMessage);
    posted += slice.length;

    const result = await postReplayBatch(args, messages);
    if (!result.ok) {
      failedBatches++;
      console.error(
        `[drain-dlq] replay batch ${Math.floor(i / REPLAY_BATCH_SIZE) + 1} failed: ` +
          `HTTP ${result.status}: ${result.bodyText.slice(0, 500)}`,
      );
      continue;
    }
    acknowledged += slice.length;

    // Only delete rows that the route accepted — failed batches stay
    // in click_failures so the next run picks them up.
    const idsToDelete = slice.map((row) => row.id);
    const { error: deleteError, count } = await sb
      .from("click_failures")
      .delete({ count: "exact" })
      .in("id", idsToDelete);
    if (deleteError) {
      // The replay POST already succeeded, so the click rows are now in
      // affiliate_clicks (deduped via click_id ON CONFLICT DO NOTHING).
      // A delete failure here is non-fatal but surfaces as a warning so
      // the next run does not double-replay (the route's idempotency
      // protects us, but we still want the click_failures row to vacate
      // so the dashboard backlog clears).
      console.warn(
        `[drain-dlq] click_failures delete after successful replay returned: ${deleteError.message}`,
      );
    } else {
      deleted += count ?? idsToDelete.length;
    }
  }

  return { total, prefilteredOut, posted, acknowledged, failedBatches, deleted };
}

async function purge(
  sb: SupabaseClient,
  args: CliArgs,
): Promise<{ matched: number; deleted: number }> {
  if (!args.olderThanDays) {
    throw new Error("--older-than-days is required for `purge`.");
  }
  const cutoff = new Date(Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: matched, error: countError } = await sb
    .from("click_failures")
    .select("id")
    .lt("created_at", cutoff)
    .limit(args.limit);
  if (countError) {
    throw new Error(`click_failures count failed: ${countError.message}`);
  }
  const ids = (matched ?? []).map((r: { id: string }) => r.id);
  if (args.dryRun || ids.length === 0) {
    return { matched: ids.length, deleted: 0 };
  }
  const { error: deleteError, count } = await sb
    .from("click_failures")
    .delete({ count: "exact" })
    .in("id", ids);
  if (deleteError) {
    throw new Error(`click_failures delete failed: ${deleteError.message}`);
  }
  return { matched: ids.length, deleted: count ?? ids.length };
}

function summarizeFailureRow(row: ClickFailureRow): string {
  const payload = row.payload as ClickMessage | null;
  const site = typeof payload?.site_id === "string" ? payload.site_id.slice(0, 8) : "?";
  const product =
    typeof payload?.product_name === "string" ? payload.product_name.slice(0, 40) : "?";
  return `  ${row.created_at}  ${row.id.slice(0, 8)}  site=${site}  product=${product}  err=${row.error_message ?? ""}`;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    printHelp();
    process.exit(1);
  }

  if (args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "replay" && !args.target) {
    throw new Error("--target or APP_URL is required for `replay`.");
  }

  const sb = getSupabaseClient();

  if (args.command === "list") {
    const rows = await fetchFailures(sb, args);
    if (args.json) {
      process.stdout.write(JSON.stringify({ count: rows.length, rows }, null, 2) + "\n");
    } else {
      process.stdout.write(`Found ${rows.length} click_failures row(s) (limit=${args.limit}):\n`);
      for (const row of rows) {
        process.stdout.write(summarizeFailureRow(row) + "\n");
      }
    }
    return;
  }

  if (args.command === "replay") {
    const result = await replay(sb, args);
    const output = args.json
      ? JSON.stringify({ ...result, dryRun: args.dryRun, target: args.target }, null, 2)
      : [
          `replay summary (${args.dryRun ? "dry-run" : "applied"}):`,
          `  total fetched     : ${result.total}`,
          `  prefiltered (bad) : ${result.prefilteredOut}`,
          `  posted            : ${result.posted}`,
          `  acknowledged      : ${result.acknowledged}`,
          `  failed batches    : ${result.failedBatches}`,
          `  deleted from sink : ${result.deleted}`,
        ].join("\n");
    process.stdout.write(output + "\n");
    if (result.failedBatches > 0) {
      process.exit(2);
    }
    return;
  }

  if (args.command === "purge") {
    const result = await purge(sb, args);
    const output = args.json
      ? JSON.stringify({ ...result, dryRun: args.dryRun }, null, 2)
      : `purge summary (${args.dryRun ? "dry-run" : "applied"}): matched=${result.matched} deleted=${result.deleted}`;
    process.stdout.write(output + "\n");
    return;
  }
}

main().catch((err) => {
  process.stderr.write(`drain-dlq failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
