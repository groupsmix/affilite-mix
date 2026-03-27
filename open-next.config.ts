// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
	// To enable R2 incremental caching:
	// 1. Create an R2 bucket in the Cloudflare dashboard (e.g. "next-inc-cache")
	// 2. Add r2_buckets binding to wrangler.jsonc:
	//    "r2_buckets": [{ "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "next-inc-cache" }]
	// 3. Uncomment the import above and the line below:
	// incrementalCache: r2IncrementalCache,
});
