# Serverless Limits Review

## Cloudflare Workers / OpenNext Constraints
- **CPU Time:** Limits per isolate are 50ms for free, and up to 30s for Unbound. `app/api/track/click` uses `ctx.waitUntil()` to push heavy operations to the background.
- **Memory:** Bound to 128MB. Avoid buffering large file uploads; `app/api/upload` uses stream/R2 limits.
- **Subrequests:** Max 50 per request.
- **Request Body Limits:** `5MB` enforced in `app/api/upload/route.ts`.
- **AI Cron Duration:** `0 2 * * *` AI cron runs concurrently and is budgeted to avoid timeout.
- **Sitemap Generation:** Uses incremental cache generation if data is massive.
