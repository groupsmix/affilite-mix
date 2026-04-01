# API Reference

All endpoints are served under the application root (e.g. `https://wristnerd.xyz/api/...`).

## Authentication

Admin endpoints require a valid JWT session cookie (`nh_admin_token`). Obtain one via `POST /api/auth/login`.

State-changing requests (POST, PUT, DELETE) to `/api/*` require a valid CSRF token. Obtain one via `GET /api/auth/csrf`, then send it in the `x-csrf-token` header. The CSRF token is rotated after each successful state-changing request; the new token is returned in the `x-csrf-token-refreshed` response header.

**Exempt from CSRF:** `/api/auth/csrf`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`.

---

## Public Endpoints

### `GET /api/health`

Health check. Verifies the application is running and Supabase connectivity.

**Auth:** None  
**Response (200):**

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latencyMs": 42 }
  }
}
```

**Response (503):** `{ "status": "degraded", "checks": { ... } }`

---

### `POST /api/newsletter`

Subscribe to the site newsletter.

**Auth:** None  
**Rate limit:** 3 requests / 15 min per IP  
**Headers:** `x-csrf-token` (CSRF token)  
**Body:**

```json
{
  "email": "user@example.com",
  "turnstileToken": "..."
}
```

**Response (200):** `{ "ok": true, "message": "Please check your email to confirm your subscription" }`  
**Response (400):** `{ "error": "Invalid email address" }`  
**Response (429):** `{ "error": "Too many requests" }`

---

### `GET /api/newsletter/confirm?token=<token>`

Confirm a newsletter subscription via the emailed confirmation link.

**Auth:** None  
**Query params:** `token` (required) — confirmation token from the email  
**Response (200):** `{ "ok": true }`  
**Response (400):** `{ "error": "Invalid or expired token" }`

---

### `GET /api/newsletter/unsubscribe?token=<token>&email=<email>`

Unsubscribe from the newsletter.

**Auth:** None  
**Query params:** `token`, `email`  
**Response (200):** `{ "ok": true }`

---

### `GET /api/track/click`

### `POST /api/track/click`

Track an affiliate link click. POST is supported for `navigator.sendBeacon()`.

**Auth:** None  
**Rate limit:** 60 requests / min per IP  
**Query params (GET) / Body (POST):**

- `product` (required) — product slug
- `url` (optional) — affiliate URL override
- `source` (optional) — content slug where the click originated
- `ref` (optional) — referrer

**Response (200):**

```json
{ "ok": true, "redirectUrl": "https://merchant.com/product?ref=..." }
```

---

### `GET /api/gift-finder`

Get product recommendations based on gift criteria. Only available on sites with `giftFinder` feature enabled.

**Auth:** None  
**Query params:**

- `budget` — max price (e.g. `500`)
- `occasion` — occasion slug (e.g. `birthday`)
- `recipient` — recipient slug (e.g. `for-him`)
- `style` — style preference (e.g. `classic`)

**Response (200):**

```json
{ "products": [ { "name": "...", "slug": "...", ... } ] }
```

---

## Auth Endpoints

### `GET /api/auth/csrf`

Issue a CSRF token. Sets the `nh_csrf` cookie and returns the token in the response body.

**Auth:** None  
**Response (200):** `{ "csrfToken": "..." }`

---

### `POST /api/auth/login`

Authenticate an admin user.

**Auth:** None  
**Rate limit:** 5 attempts / 15 min per IP; 10 attempts / 15 min per email  
**Body:**

```json
{
  "email": "admin@example.com",
  "password": "...",
  "turnstileToken": "..."
}
```

**Response (200):** `{ "ok": true }` (sets `nh_admin_token` cookie)  
**Response (401):** `{ "error": "Invalid email or password" }`  
**Response (429):** `{ "error": "Too many login attempts" }`

---

### `POST /api/auth/logout`

End the admin session.

**Auth:** Admin session cookie  
**Response (200):** `{ "ok": true }` (clears `nh_admin_token` cookie)

---

### `GET /api/auth/me`

Get current admin session info.

**Auth:** Admin session cookie  
**Response (200):**

```json
{
  "role": "admin",
  "email": "admin@example.com",
  "activeSite": { "id": "watch-tools", "name": "WristNerd" }
}
```

**Response (401):** `{ "error": "Not authenticated" }`

---

### `POST /api/auth/refresh`

Re-issue the admin JWT to extend the session.

**Auth:** Admin session cookie  
**Response (200):** `{ "ok": true }` (sets new `nh_admin_token` cookie)  
**Response (401):** `{ "error": "Not authenticated" }`

---

### `POST /api/auth/forgot-password`

Request a password reset email.

**Auth:** None  
**Rate limit:** 3 attempts / 15 min per IP  
**Body:** `{ "email": "admin@example.com" }`  
**Response (200):** `{ "ok": true }` (always returns 200 to prevent user enumeration)

---

### `POST /api/auth/reset-password`

Reset password using a token from the reset email.

**Auth:** None  
**Rate limit:** 5 attempts / 15 min per IP  
**Body:**

```json
{
  "token": "reset-token-from-email",
  "password": "new-password"
}
```

**Response (200):** `{ "ok": true }`  
**Response (400):** `{ "error": "Invalid or expired token" }`

---

## Admin Endpoints

All admin endpoints require an active admin session and are rate-limited to **100 requests / min per user**.

The active site is determined by the `nh_active_site` cookie. All admin CRUD operations are scoped to the active site.

---

### Categories

#### `GET /api/admin/categories`

List all categories for the active site.

**Response (200):** `CategoryRow[]`

#### `POST /api/admin/categories`

Create a new category.

**Body:**

```json
{
  "name": "Exchanges",
  "slug": "exchanges",
  "description": "Crypto exchange reviews",
  "taxonomy_type": "general"
}
```

**Response (200):** `CategoryRow`  
**Response (400):** `{ "error": "Validation failed", "details": { ... } }`

#### `PUT /api/admin/categories`

Update an existing category.

**Body:**

```json
{
  "id": "uuid",
  "name": "Updated Name"
}
```

**Response (200):** `CategoryRow`

#### `DELETE /api/admin/categories`

Delete a category.

**Body:** `{ "id": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Content

#### `GET /api/admin/content`

List content for the active site.

**Query params:**

- `content_type` — filter by type (`article`, `review`, `comparison`, `guide`, `blog`)
- `status` — filter by status (`draft`, `review`, `published`, `scheduled`, `archived`)
- `category_id` — filter by category UUID
- `limit` — max results (default: 50)
- `offset` — pagination offset

**Response (200):** `ContentRow[]`

#### `POST /api/admin/content`

Create new content. The `body` field is HTML-sanitized server-side.

**Body:**

```json
{
  "title": "Best Crypto Exchanges",
  "slug": "best-crypto-exchanges",
  "body": "<h2>...</h2><p>...</p>",
  "excerpt": "Compare the top exchanges...",
  "type": "comparison",
  "status": "draft",
  "category_id": "uuid-or-null",
  "tags": ["exchanges", "comparison"],
  "author": "CryptoTools Team",
  "publish_at": "2026-04-01T00:00:00Z",
  "meta_title": "Best Crypto Exchanges 2026",
  "meta_description": "...",
  "og_image": "https://..."
}
```

**Response (200):** `ContentRow`

#### `PUT /api/admin/content`

Update existing content.

**Body:** Same as POST but with `id` (UUID) field. Only provided fields are updated.

**Response (200):** `ContentRow`

#### `DELETE /api/admin/content`

Delete content.

**Body:** `{ "id": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Content Cloning

#### `POST /api/admin/content/clone`

Clone an existing content item to the active site.

**Body:** `{ "contentId": "uuid" }`  
**Response (200):** `ContentRow` (the new cloned item)

---

### Content Sharing

#### `POST /api/admin/content/share`

Share content across sites via the shared content library.

**Body:** `{ "contentId": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Content-Product Links

#### `PUT /api/admin/content-products`

Set the linked products for a content item (replaces all existing links).

**Body:**

```json
{
  "content_id": "uuid",
  "links": [
    { "product_id": "uuid", "role": "hero" },
    { "product_id": "uuid", "role": "featured" }
  ]
}
```

Allowed roles: `hero`, `featured`, `related`, `vs-left`, `vs-right`.

**Response (200):** `{ "ok": true }`

---

### Products

#### `GET /api/admin/products`

List products for the active site.

**Query params:**

- `category_id` — filter by category UUID
- `status` — filter by status (`draft`, `active`, `archived`)
- `limit` — max results
- `offset` — pagination offset

**Response (200):** `ProductRow[]`

#### `POST /api/admin/products`

Create a new product.

**Body:**

```json
{
  "name": "Binance",
  "slug": "binance",
  "description": "World's largest crypto exchange...",
  "affiliate_url": "https://www.binance.com/ref/...",
  "image_url": "https://...",
  "image_alt": "Binance logo on dark background",
  "price": "Free to join",
  "price_amount": 0,
  "price_currency": "USD",
  "merchant": "Binance",
  "score": 9.2,
  "featured": true,
  "status": "active",
  "category_id": "uuid-or-null",
  "cta_text": "Get Started",
  "deal_text": "20% off fees",
  "deal_expires_at": "2026-12-31T00:00:00Z",
  "pros": "Low fees, wide selection",
  "cons": "Complex for beginners"
}
```

**Response (200):** `ProductRow`

#### `PUT /api/admin/products`

Update an existing product.

**Body:** Same as POST but with `id` (UUID) field. Only provided fields are updated.

**Response (200):** `ProductRow`

#### `DELETE /api/admin/products`

Delete a product.

**Body:** `{ "id": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Product Import/Export

#### `GET /api/admin/products/export`

Export all products for the active site as JSON.

**Response (200):** `ProductRow[]`

#### `POST /api/admin/products/import`

Bulk import products from JSON.

**Body:** `{ "products": [ ... ] }`  
**Response (200):** `{ "ok": true, "imported": 5 }`

---

### Sites

#### `GET /api/admin/sites`

List all sites (DB-first, falls back to config).

**Auth:** Admin session  
**Response (200):** Site list with both DB and config data.

#### `POST /api/admin/sites`

Create a new site.

**Auth:** Super admin  
**Body:** Site configuration object (slug, name, domain, language, etc.)  
**Response (200):** Site row

#### `PUT /api/admin/sites/[id]`

Update a site's configuration.

**Auth:** Super admin  
**Body:** Partial site update fields  
**Response (200):** Updated site row

#### `DELETE /api/admin/sites/[id]`

Delete a site.

**Auth:** Super admin  
**Response (200):** `{ "ok": true }`

---

### Site Selection

#### `POST /api/admin/sites/select`

Set the active site for the admin session (sets `nh_active_site` cookie).

**Body:** `{ "siteId": "watch-tools" }`  
**Response (200):** `{ "ok": true }`

---

### Site Templates

#### `GET /api/admin/sites/templates`

List available niche templates for creating new sites.

**Response (200):** `NicheTemplate[]`

---

### Pages

#### `GET /api/admin/pages`

List custom pages for the active site.

**Response (200):** `PageRow[]`

#### `POST /api/admin/pages`

Create a custom page.

**Body:** `{ "title": "...", "slug": "...", "body": "...", ... }`  
**Response (200):** `PageRow`

#### `PUT /api/admin/pages/[id]`

Update a custom page.

**Body:** Partial page update fields  
**Response (200):** `PageRow`

#### `DELETE /api/admin/pages/[id]`

Delete a custom page.

**Response (200):** `{ "ok": true }`

#### `PUT /api/admin/pages/reorder`

Reorder pages.

**Body:** `{ "order": ["uuid1", "uuid2", ...] }`  
**Response (200):** `{ "ok": true }`

---

### Ads

#### `GET /api/admin/ads`

List ad placements for the active site.

**Response (200):** `AdPlacement[]`

#### `POST /api/admin/ads`

Create an ad placement.

**Body:** Ad placement configuration  
**Response (200):** `AdPlacement`

#### `PUT /api/admin/ads/[id]`

Update an ad placement.

**Response (200):** `AdPlacement`

#### `DELETE /api/admin/ads/[id]`

Delete an ad placement.

**Response (200):** `{ "ok": true }`

#### `POST /api/track/impression`

Record an ad impression from the public site. This endpoint is intentionally unauthenticated (called from the sandboxed ad iframe).

> **Note:** The legacy endpoint `POST /api/admin/ads/impressions` is deprecated. Use this endpoint instead.

**Body:** `{ "ad_placement_id": "uuid", "page_path": "/" }`  
**Response (200):** `{ "ok": true }`

---

### Analytics

#### `GET /api/admin/analytics`

Dashboard analytics for the active site.

**Query params:**

- `days` — lookback window (default: 30, max: 365)

**Response (200):**

```json
{
  "clicks": { "total": 1234, "daily": [...] },
  "topProducts": [...],
  "topReferrers": [...],
  "contentCount": 15,
  "productCount": 30
}
```

---

### Upload

#### `POST /api/admin/upload`

Get a presigned R2 upload URL for an image.

**Body:**

```json
{
  "fileName": "product-image.webp",
  "contentType": "image/webp",
  "fileSize": 524288
}
```

Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`.  
Max file size: 10 MB. SVG is **not** allowed.

**Response (200):** `{ "uploadUrl": "https://...", "publicUrl": "https://..." }`

---

### Scheduled Jobs

#### `GET /api/admin/schedule`

List scheduled jobs for the active site.

**Query params:**

- `status` — filter by status (`pending`, `executed`, `failed`, `cancelled`)
- `limit` — max results (default: 50)

**Response (200):** `ScheduledJob[]`

#### `POST /api/admin/schedule`

Create a scheduled job.

**Body:**

```json
{
  "job_type": "publish_content",
  "target_id": "uuid",
  "scheduled_for": "2026-04-01T00:00:00Z"
}
```

Allowed job types: `publish_content`, `activate_product`, `archive_content`, `archive_product`, `custom`.

**Response (200):** `ScheduledJob`

#### `DELETE /api/admin/schedule`

Cancel a scheduled job.

**Body:** `{ "id": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Admin Users

#### `GET /api/admin/users`

List all admin users.

**Auth:** Super admin  
**Response (200):** `AdminUser[]` (password hashes excluded)

#### `POST /api/admin/users`

Create a new admin user.

**Auth:** Super admin  
**Body:**

```json
{
  "email": "newadmin@example.com",
  "password": "secure-password",
  "role": "admin"
}
```

**Response (200):** `AdminUser`

#### `PUT /api/admin/users`

Update an admin user (change role, reset password).

**Auth:** Super admin  
**Body:** `{ "id": "uuid", "role": "super_admin" }` or `{ "id": "uuid", "password": "new-password" }`  
**Response (200):** `AdminUser`

#### `DELETE /api/admin/users`

Delete an admin user.

**Auth:** Super admin  
**Body:** `{ "id": "uuid" }`  
**Response (200):** `{ "ok": true }`

---

### Preview Token

#### `POST /api/admin/preview-token`

Generate a short-lived preview token for viewing draft/unpublished content.

**Body:** `{ "contentId": "uuid" }`  
**Response (200):** `{ "token": "...", "expiresAt": "..." }`

---

## Cron Endpoints

Secured via `Authorization: Bearer <CRON_SECRET>` header.

### `POST /api/cron/publish`

Publish scheduled content & products, archive expired items. Triggered every 5 minutes by the Cloudflare Cron Trigger.

**Auth:** CRON_SECRET  
**Response (200):** `{ "published": [...], "archived": [...] }`

---

### `POST /api/cron/sitemap-refresh`

Revalidate sitemap and content caches. Designed for daily execution.

**Auth:** CRON_SECRET  
**Response (200):** `{ "ok": true, "revalidated": ["content", "products", "categories", "sitemap"] }`

---

## Webhook Endpoints

### `POST /api/revalidate`

On-demand cache revalidation webhook. Call after admin content changes to propagate updates immediately.

**Auth:** CRON_SECRET  
**Body (optional):**

```json
{ "tags": ["content", "products"] }
```

If no tags are provided, all cacheable tags are revalidated.

**Response (200):** `{ "ok": true, "revalidated": ["content", "products"] }`

---

## Internal Endpoints

### `GET /api/internal/resolve-site?domain=<hostname>`

Resolve a hostname to a site ID via database lookup. Used internally by the middleware for wildcard subdomain routing.

**Auth:** Internal header (`x-internal-token`) — prevents external domain enumeration  
**Response (200):** `{ "siteId": "slug", "isActive": true }`

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

For validation errors:

```json
{
  "error": "Validation failed",
  "details": {
    "name": "name must be a string between 1 and 200 characters",
    "slug": "slug must be a lowercase alphanumeric string with hyphens"
  }
}
```

### Common HTTP Status Codes

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 200  | Success                                      |
| 400  | Validation error or bad request              |
| 401  | Not authenticated                            |
| 403  | Forbidden (CSRF failure, insufficient role)  |
| 404  | Not found or feature disabled                |
| 429  | Rate limited (check `Retry-After` header)    |
| 500  | Internal server error                        |
| 503  | Service unavailable (e.g. R2 not configured) |
