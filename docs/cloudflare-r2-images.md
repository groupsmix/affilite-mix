# Cloudflare R2 Image Storage

How admin image uploads work and why they use S3-API access keys instead of a Worker binding.

> **Last updated:** April 2026

---

## Architecture

```
Admin browser                       Cloudflare R2
     |                                   |
     |  1. POST /api/admin/upload        |
     |     { fileName, contentType }     |
     |  ──────────────────────────────>  |
     |     (Next.js server generates     |
     |      presigned PUT URL via        |
     |      S3-compatible API)           |
     |  <──────────────────────────────  |
     |     { uploadUrl, publicUrl }      |
     |                                   |
     |  2. PUT <presigned URL>           |
     |     (binary file body)            |
     |  ──────────────────────────────>  |
     |     (browser uploads directly     |
     |      to R2, bypassing the worker) |
     |                                   |
```

The Next.js server **never touches the file bytes**. It only generates a short-lived presigned URL (5 min TTL) using the S3-compatible signing flow, then the browser uploads the file directly to R2.

## Why S3-API access keys, not a Worker binding?

| Approach                            | Pros                                                                                              | Cons                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **S3-API presigned URL** (current)  | Browser uploads directly to R2; zero worker CPU/memory for large files; standard S3 tooling works | Requires R2 access key management                                   |
| **Worker R2 binding (`IMAGES_R2`)** | No access keys needed; simpler auth                                                               | Worker must proxy every byte; 100 MB request limit; wastes CPU time |

For image uploads (up to 10 MB), the presigned URL approach is the correct choice. A Worker binding (`IMAGES_R2`) would force every upload through the worker, adding latency and consuming CPU milliseconds unnecessarily.

## Required environment variables

All five variables are **server-side only** (never exposed to the browser). They are used exclusively by `lib/r2.ts` to generate presigned URLs.

| Variable               | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare account ID (same as `CLOUDFLARE_ACCOUNT_ID`)         |
| `R2_ACCESS_KEY_ID`     | R2 API token — Access Key ID                                    |
| `R2_SECRET_ACCESS_KEY` | R2 API token — Secret Access Key                                |
| `R2_BUCKET_NAME`       | R2 bucket name (e.g. `affilite-mix-images`)                     |
| `R2_PUBLIC_URL`        | Public URL for the bucket (e.g. `https://images.wristnerd.xyz`) |

### How to create R2 access keys

1. Go to **Cloudflare Dashboard > R2 > Manage R2 API Tokens**
2. Click **Create API Token**
3. Set permissions: **Object Read & Write**
4. Scope to the specific bucket (e.g. `affilite-mix-images`)
5. Copy the Access Key ID and Secret Access Key

### Setting secrets for production

These are **runtime secrets** set via `wrangler secret put`, not build-time env vars:

```bash
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
wrangler secret put R2_PUBLIC_URL
```

> **Note:** Do NOT add these to the `deploy.yml` workflow `env:` block. They are runtime secrets that must reach the worker via `wrangler secret`, not build-time environment variables embedded in the bundle.

## What about `NEXT_INC_CACHE_R2_BUCKET` in wrangler.jsonc?

That is a **separate** R2 bucket used by `@opennextjs/cloudflare` for Next.js incremental cache (ISR). It uses a Worker binding (not S3-API keys) because the worker itself reads/writes cache entries — no browser involvement.

| Binding                    | Bucket                | Purpose                                 |
| -------------------------- | --------------------- | --------------------------------------- |
| `NEXT_INC_CACHE_R2_BUCKET` | `next-inc-cache`      | ISR incremental cache (worker-internal) |
| _(none — S3 API)_          | `affilite-mix-images` | Admin image uploads (browser-direct)    |

## Related files

- `lib/r2.ts` — presigned URL generator (lightweight S3v4 signer)
- `app/api/admin/upload/route.ts` — upload endpoint (auth + validation)
- `app/admin/(dashboard)/components/image-uploader.tsx` — drag-and-drop UI
- `wrangler.jsonc` — only binds `NEXT_INC_CACHE_R2_BUCKET` (incremental cache)
