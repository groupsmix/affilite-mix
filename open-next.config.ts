// open-next.config.ts — Cloudflare adapter configuration for OpenNext.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  // R2 incremental cache for ISR/SSG page output.
  incrementalCache: r2IncrementalCache,

  // AUDIT-26: Durable-Object sharded tag cache.
  //
  // Without this, every `revalidateTag()` / `revalidatePath()` call in the
  // admin + cron routes (categories, products, content, sites, sitemap
  // refresh, scheduled publish, …) is a silent no-op against the R2
  // incremental cache: CMS edits never purge the cached HTML, so published
  // changes can stay stale until the page's time-based revalidation elapses.
  //
  // The backing Durable Object (`NEXT_TAG_CACHE_DO_SHARDED` →
  // `DOShardedTagCache`) and its SQLite migration are already declared in
  // wrangler.jsonc and the class is re-exported from
  // workers/custom-worker.ts; this line is what actually activates them.
  tagCache: doShardedTagCache,

  // AUDIT-26: Durable-Object revalidation queue.
  //
  // De-duplicates concurrent on-demand ISR revalidations across edge
  // isolates (the default in-memory queue is per-isolate, so the same
  // revalidation can fan out redundantly). Backed by the already-declared
  // `NEXT_CACHE_DO_QUEUE` → `DOQueueHandler` Durable Object.
  queue: doQueue,
});
