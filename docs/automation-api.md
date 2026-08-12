# Automation API integration guide

This is the authoritative, code-derived guide for an AI agent operating one
Affilite Mix site. It describes the scoped automation API, the human approval
plane, and the read surfaces currently available. The token determines the
site; request bodies and query strings cannot widen that binding.

The API returns this envelope for `/api/automation/v1/*`:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "request_id": "uuid",
    "api_version": "1"
  }
}
```

Errors use:

```json
{
  "ok": false,
  "error": {
    "code": "AUTOMATION_SCOPE_MISSING",
    "message": "Missing required scope: products:update",
    "retryable": false,
    "details": { "required_scope": "products:update" }
  },
  "meta": {
    "request_id": "uuid",
    "api_version": "1"
  }
}
```

The response also carries the `API-Version` header. Send `x-request-id` or
`x-trace-id` when correlating a request; otherwise the server generates
`meta.request_id`.

## 1. Authentication

### Create a service account and its token

Only a human `super_admin` can provision an automation account. This is an
admin-session operation, not an automation-token operation:

```bash
curl -X POST "$BASE/api/admin/automation/service-accounts" \
  -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -b "__Host-nh_admin_token=$SESSION; __Host-nh_csrf=$CSRF" \
  -d '{
    "name": "affiliate-operator",
    "site_id": "SITE_UUID",
    "scopes": ["site:read", "analytics:read", "products:read", "products:update", "affiliate:status"],
    "max_actions_per_run": 25,
    "max_actions_per_day": 200,
    "ttl_days": 90
  }'
```

`name` is required and is at most 128 characters. `site_id` must be a UUID.
`ttl_days` is accepted from greater than 0 through 365; invalid values fall
back to 90. If action limits are omitted, the defaults are
`max_actions_per_run: 25` and `max_actions_per_day: 200`. The response is
HTTP 201 and contains:

```json
{
  "service_account": {
    "id": "ACCOUNT_UUID",
    "site_id": "SITE_UUID",
    "name": "affiliate-operator",
    "status": "active",
    "scopes": [
      "site:read",
      "analytics:read",
      "products:read",
      "products:update",
      "affiliate:status"
    ],
    "max_actions_per_run": 25,
    "max_actions_per_day": 200,
    "created_at": "2026-08-12T00:00:00.000Z"
  },
  "token": { "id": "TOKEN_UUID", "expires_at": "2026-11-10T00:00:00.000Z" },
  "plain_token": "atk_..."
}
```

`plain_token` is returned once. Store it as a secret. Only its hash is stored.
The grantable scope strings are:

- Reads: `site:read`, `analytics:read`, `content:read`, `products:read`,
  `affiliate:status`, `jobs:read`, `audit:read-own`
- Mutations: `content:draft`, `content:update`, `content:schedule`,
  `content:publish`, `products:update`, `products:activate`, `jobs:trigger`

The following are explicitly forbidden and cannot be granted:
`content:delete`, `products:delete`, `integrations:configure`, `sites:write`,
`users:write`, and `secrets:write`.

To revoke an account, a human `super_admin` sends
`DELETE /api/admin/automation/service-accounts/{id}`. It returns
`{"ok":true,"status":"revoked"}`. Revocation immediately invalidates its
automation tokens.

### Call the scoped API

Use only the token's server-bound site:

```bash
curl "$BASE/api/automation/v1/health" \
  -H "Authorization: Bearer $AUTOMATION_TOKEN"
```

The automation API accepts an `atk_` service-account token. It also accepts a
valid site-bound admin API token for scope-less compatibility endpoints such as
`health`, but admin tokens have no automation scopes and cannot perform scoped
machine actions. Do not use a full-admin bearer token for the agent's normal
work; provision an automation service account instead.

Unlike the browser admin API, automation requests use no cookie and no CSRF
token. The token supplies `site_id`; do not send a site selector and do not
assume `x-admin-site` changes the site.

### Admin bearer denial

The full-admin bearer token is not an alternative to the scoped automation
plane. Machine callers are hard-denied on these route groups:

- `/api/admin/users`
- `/api/admin/api-tokens`
- `/api/admin/permissions`
- `/api/admin/sites`
- `/api/admin/automation/service-accounts`
- `/api/admin/integrations`
- `/api/admin/affiliate-networks`
- `/api/admin/privacy`

The exact response is HTTP 403:

```json
{
  "error": "Machine callers are not permitted on this admin route",
  "code": "ADMIN_MACHINE_ACCESS_DENIED"
}
```

Stop and escalate to the owner; retries and headers cannot make a machine
caller pass this check. Human browser sessions are still allowed where the
route requires them.

## 2. Automation endpoints

All paths below are site-scoped by the token. All request fields and defaults
listed here come from the route parsers in `lib/automation/schemas.ts`.

### Liveness and context

#### `GET /api/automation/v1/health`

- Scope: none
- Body: none
- Success: HTTP 200

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "site_id": "SITE_UUID",
    "service_account_id": "ACCOUNT_UUID",
    "account_status": "active",
    "time": "2026-08-12T00:00:00.000Z"
  },
  "meta": { "request_id": "REQ_UUID", "api_version": "1" }
}
```

#### `GET /api/automation/v1/context`

- Scope: `site:read`
- Body: none
- Success: HTTP 200

```json
{
  "ok": true,
  "data": {
    "site": { "id": "SITE_UUID", "slug": "ai-compared", "name": "AI Compared" },
    "scopes": ["site:read", "products:update"],
    "limits": {
      "max_actions_per_run": 25,
      "max_actions_per_day": 200,
      "actions_today": 3,
      "actions_remaining_today": 197
    },
    "counts": { "content": 42, "drafts": 2, "products": 18 },
    "policies": [{ "action_type": "products.update", "mode": "allow", "is_active": true }]
  },
  "meta": { "request_id": "REQ_UUID", "api_version": "1" }
}
```

### Analytics

#### `GET /api/automation/v1/analytics/summary`

- Scope: `analytics:read`
- Body: none
- Success: HTTP 200

```json
{
  "ok": true,
  "data": {
    "clicks": { "last_7_days": 123, "last_30_days": 456 },
    "content": { "published": 42 },
    "products": { "active": 18 },
    "generated_at": "2026-08-12T00:00:00.000Z"
  },
  "meta": { "request_id": "REQ_UUID", "api_version": "1" }
}
```

This is the only EPC-adjacent read in the scoped API. There is currently no
scoped `/api/automation/v1` endpoint for per-product EPC, product rows, or
affiliate-link health. See [Read surfaces](#6-read-surfaces-and-current-gaps).

### Content reads

#### `GET /api/automation/v1/content`

- Scope: `content:read`
- Query: `status` (`draft`, `review`, `published`, `scheduled`, `archived`),
  `type`, `q`, `limit` (default 25, maximum 100), and keyset `cursor`
- Body: none
- Success: HTTP 200

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "CONTENT_UUID",
        "title": "Best AI tools",
        "slug": "best-ai-tools",
        "type": "comparison",
        "status": "published",
        "publish_at": "2026-08-11T10:00:00.000Z",
        "updated_at": "2026-08-11T10:00:00.000Z"
      }
    ],
    "next_cursor": "2026-08-11T10:00:00.000Z"
  },
  "meta": { "request_id": "REQ_UUID", "api_version": "1" }
}
```

`status=pending` reads `ai_drafts` and returns `id`, `title`, `slug`,
`excerpt`, `type`, `status`, `publish_at: null`, and `updated_at`.

#### `GET /api/automation/v1/content/drafts`

- Scope: `content:read`
- Query: `status` (`pending`, `approved`, `rejected`, `published`), `type`, `q`,
  `limit` (default 25, maximum 100), and `cursor`
- Body: none
- Success data: `{ "items": [...], "next_cursor": "..." }`

Each item contains `id`, `title`, `slug`, `excerpt`, `content_type`, `topic`,
`keywords`, `status`, `ai_provider`, `ai_model`, `generated_at`, `created_at`,
and `updated_at`.

#### `GET /api/automation/v1/content/drafts/{id}`

- Scope: `content:read`
- Body: none
- Success: HTTP 200 with `{ "draft": <full ai_drafts row> }`
- Invalid UUID: `AUTOMATION_BAD_REQUEST` / HTTP 400
- Missing draft: `AUTOMATION_NOT_FOUND` / HTTP 404

### Content mutations

Every mutation requires an `Idempotency-Key`; see the contract below.

#### `POST /api/automation/v1/content/generate`

- Scope: `content:draft`
- Body:

```json
{
  "topic": "AI writing tools",
  "content_type": "review",
  "keywords": ["AI", "writing"]
}
```

`topic` is required and at most 300 characters. `content_type` defaults to
`article` and must be `article`, `review`, `comparison`, or `guide`.
`keywords` is optional and capped at 25 strings.

With configured AI providers, success is HTTP 201:
`{ "draft_id": "DRAFT_UUID", "status": "pending", "replayed": false }`.
The draft remains pending; this endpoint does not publish it. If no provider is
configured, it returns `AUTOMATION_AI_NOT_CONFIGURED` / HTTP 503.

#### `POST /api/automation/v1/content/drafts`

- Scope: `content:draft`
- Body:

```json
{
  "title": "Best AI writing tools",
  "slug": "best-ai-writing-tools",
  "body": "<article body>",
  "excerpt": "A practical comparison.",
  "content_type": "comparison",
  "topic": "AI writing tools",
  "keywords": ["AI", "writing"],
  "meta_title": "Best AI writing tools",
  "meta_description": "Compare AI writing tools.",
  "ai_provider": "external",
  "ai_model": "unknown",
  "run_id": "RUN_UUID"
}
```

`title`, `slug`, and `body` are required. `slug` is lowercase alphanumeric
words separated by hyphens. `excerpt` is capped at 1,000 characters; `body` at
200,000; `title` and `slug` at 300; `meta_title` at 200; and `keywords` at 25.
`content_type`, `ai_provider`, and `ai_model` default to `article`, `external`,
and `unknown`. `meta_title`, `meta_description`, and `run_id` may be null.
Success is HTTP 201 with `{ "draft_id": "...", "status": "pending",
"replayed": false }`.

#### `PATCH /api/automation/v1/content/drafts/{id}`

- Scope: `content:draft`
- Body: any non-empty subset of `title`, `slug`, `body`, `excerpt`,
  `content_type`, `topic`, `keywords`, `meta_title`, `meta_description`,
  `ai_provider`, `ai_model`, `status`, and `run_id`
- Success: HTTP 200 with `{ "draft": <updated row> }`

`status` accepts `pending`, `approved`, `rejected`, or `published`. Setting it
to `published` additionally requires `content:publish` and publishes through
the same publish logic. Empty updates return `AUTOMATION_BAD_REQUEST` / HTTP 400.

#### `DELETE /api/automation/v1/content/drafts/{id}`

- Scope: `content:draft`
- Body: none
- Success: HTTP 200 with `{ "deleted": true, "draft_id": "DRAFT_UUID" }`

#### `POST /api/automation/v1/content/drafts/{id}/publish`

- Scope: `content:publish`
- Body: optional subset of `title`, `slug`, `excerpt`, `body`, `content_type`,
  `meta_title`, and `meta_description`
- Success: HTTP 201 with `{ "content_id": "...", "draft_id": "..." }`

Publishing can return `AUTOMATION_NOT_FOUND` / 404,
`AUTOMATION_VALIDATION_ERROR` / 422, `AUTOMATION_SLUG_CONFLICT` / 409, or
`AUTOMATION_INTERNAL_ERROR` / 500.

### Product mutations

#### `PATCH /api/automation/v1/products/{id}`

- Scope: `products:update`
- Body: either `{ "updates": { ... } }` or the update fields directly
- Allowed `updates` fields:
  `name`, `description`, `image_url`, `image_alt`, `price`,
  `price_amount`, `price_currency`, `score`, `featured`, `category_id`,
  `category_ids`, `cta_text`, `deal_text`, `deal_expires_at`, `pros`, `cons`
- String fields are capped at 2,000 characters. `price_amount` and `score` are
  finite numbers or null; `featured` is boolean; category IDs are UUIDs or
  null. `deal_expires_at` may be null.
- Success: HTTP 200 with `{ "product_id": "PRODUCT_UUID", "status": "active" }`

The path supplies the product ID; `product_id` is not required in the request
body. The executor records before/after snapshots.

#### `POST /api/automation/v1/products/{id}/affiliate-url`

- Scope: `products:update`
- Body: `{ "affiliate_url": "https://affiliate.example/..." }`
- Success when allowed: HTTP 200 with
  `{ "product_id": "PRODUCT_UUID", "affiliate_url": "https://..." }`
- This action is approval-required by default, so normal policy behavior is
  HTTP 202 with `AUTOMATION_POLICY_APPROVAL_REQUIRED` and `meta.action_id`.
  The action is stored as `manual_attention`; no product write occurs until a
  human approves it.

The destination is validated by the existing affiliate-domain and override
guards. Invalid destinations return `AUTOMATION_VALIDATION_ERROR` / HTTP 422.

#### `POST /api/automation/v1/products/{id}/activate`

- Scope: `products:activate`
- Body: `{}` (the route supplies `product_id`)
- Default result: approval-required `AUTOMATION_POLICY_APPROVAL_REQUIRED` /
  HTTP 202 with `action_id`
- After approval, the executor returns
  `{ "product_id": "PRODUCT_UUID", "status": "active" }`.

#### `POST /api/automation/v1/products/{id}/archive`

- Scope: `products:update`
- Body: `{}`
- Default result: approval-required `AUTOMATION_POLICY_APPROVAL_REQUIRED` /
  HTTP 202 with `action_id`
- After approval, the executor returns
  `{ "product_id": "PRODUCT_UUID", "status": "archived" }`.

### Runs

#### `POST /api/automation/v1/runs`

- Scope: `site:read`
- Body: optional `trigger` and `goal`

`trigger` is one of `scheduled`, `webhook`, `owner`, `recovery`, or `agent`;
an omitted or unrecognized value becomes `agent`. `goal` is truncated to 1,000
characters and otherwise becomes null.

Success is HTTP 201:

```json
{
  "ok": true,
  "data": {
    "run": {
      "id": "RUN_UUID",
      "status": "running",
      "trigger": "agent",
      "goal": "Review affiliate destinations",
      "started_at": "2026-08-12T00:00:00.000Z"
    }
  },
  "meta": { "request_id": "REQ_UUID", "api_version": "1", "run_id": "RUN_UUID" }
}
```

The public automation API currently creates and links runs but has no
run-finalization or run-history endpoint.

### Idempotency-Key

Mutations require a header matching 8–255 characters:
`^[A-Za-z0-9][A-Za-z0-9._:-]{7,254}$`.

The server hashes the canonical JSON payload. Reusing the same key for the same
service account and identical payload returns the prior result with
`replayed: true` where that endpoint includes the flag, and never executes the
mutation again. Reusing the key with a different payload returns
`AUTOMATION_IDEMPOTENCY_CONFLICT` / HTTP 409 with `meta.action_id`. A missing or
malformed key returns `AUTOMATION_BAD_REQUEST` / HTTP 400.

## 3. Guardrail model

The policy decision is made before an executor can write. The effective mode is
the active site override, if present, otherwise the default matrix. A hard
default deny cannot be relaxed.

| Action type                     | Required scope      | Default           | Risk       |
| ------------------------------- | ------------------- | ----------------- | ---------- |
| `content.draft.create`          | `content:draft`     | allow             | low        |
| `content.update`                | `content:update`    | allow             | low        |
| `content.add_internal_links`    | `content:update`    | allow             | low        |
| `content.schedule`              | `content:schedule`  | approval_required | medium     |
| `content.publish`               | `content:publish`   | allow             | low        |
| `content.archive`               | `content:update`    | approval_required | medium     |
| `content.delete`                | none                | deny              | prohibited |
| `products.update`               | `products:update`   | allow             | low        |
| `products.update_affiliate_url` | `products:update`   | approval_required | high       |
| `products.activate`             | `products:activate` | approval_required | medium     |
| `products.archive`              | `products:update`   | approval_required | medium     |
| `products.delete`               | none                | deny              | prohibited |
| `jobs.trigger`                  | `jobs:trigger`      | approval_required | medium     |
| `integrations.configure`        | none                | deny              | prohibited |
| `sites.write`                   | none                | deny              | prohibited |
| `users.write`                   | none                | deny              | prohibited |

`content.draft.generate` is the action record used by the generation endpoint,
but its policy lookup intentionally uses the `content.draft.create` rule.

Before mode evaluation, the service account's per-run and per-day limits are
checked. The defaults when an account is created are 25 actions per run and 200
per day. Reaching either limit produces `AUTOMATION_POLICY_DENIED` / HTTP 403
with a non-retryable error. An active policy's `max_items_per_action` defaults
to 5; exceeding it changes an otherwise allowed action to approval-required.

Action states and legal transitions:

```text
proposed -> approved | policy_allowed | manual_attention | cancelled | failed
approved -> queued | cancelled
policy_allowed -> queued | running | cancelled
queued -> running | cancelled
running -> verifying | succeeded | retry_wait | failed | manual_attention
verifying -> succeeded | rolled_back | failed | manual_attention
succeeded -> rolled_back
retry_wait -> running | failed | cancelled
failed -> manual_attention
manual_attention -> approved | queued | cancelled
rolled_back -> (terminal)
cancelled -> (terminal)
```

## 4. Owner approval and rollback

These endpoints require a human admin session. They are not usable with the
automation service-account token; the `automation` route group is not a
machine shortcut around owner approval.

### List pending actions

```http
GET /api/admin/automation/actions?status=manual_attention&limit=50&offset=0
```

The query `status` must be one of the action states above. The route returns
HTTP 200:

```json
{
  "actions": [
    {
      "id": "ACTION_UUID",
      "run_id": null,
      "service_account_id": "ACCOUNT_UUID",
      "site_id": "SITE_UUID",
      "idempotency_key": "change-2026-08-12-product",
      "action_type": "products.update_affiliate_url",
      "target_type": "product",
      "target_id": "PRODUCT_UUID",
      "risk_level": "high",
      "policy_decision": "approval_required",
      "status": "manual_attention",
      "payload": { "product_id": "PRODUCT_UUID", "affiliate_url": "https://..." },
      "payload_hash": "sha256",
      "before_snapshot": null,
      "after_snapshot": null,
      "result": null,
      "attempt_count": 0,
      "next_attempt_at": null,
      "approved_by": null,
      "approved_at": null,
      "error_code": null,
      "error_message": null,
      "created_at": "2026-08-12T00:00:00.000Z",
      "updated_at": "2026-08-12T00:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### Approve, reject, and rollback

- `POST /api/admin/automation/actions/{id}/approve`: approves and immediately
  executes a `manual_attention` or `proposed` action. Success is HTTP 200 with
  `{ "action": <updated action row> }`. A stale/illegal state is HTTP 409.
- `POST /api/admin/automation/actions/{id}/reject`: body
  `{ "reason": "Not the intended merchant" }` (reason is optional and capped
  at 500 characters). It transitions to `cancelled` and returns HTTP 200 with
  `{ "action": <updated action row> }`.
- `POST /api/admin/automation/actions/{id}/rollback`: no body. Only a
  `succeeded` action with both snapshots and a registered rollback executor can
  be rolled back. Success is HTTP 200 with `{ "action": <updated action row> }`.

Rollback is compare-and-set, not blind restoration. For product metadata,
affiliate URL, and lifecycle actions, the current fields must still match the
action's `after_snapshot`. If someone changed them after execution, rollback
returns HTTP 409/422 and leaves the product unchanged. Rollback only restores
fields covered by the executor's before snapshot; it cannot undo unrelated
later edits, external merchant-side changes, or action types without a rollback
executor.

## 5. Errors and reactions

All automation errors have `error.code`, `error.message`, `error.retryable`,
and `meta`. Use the code, not message text, for control flow.

| Code                                  | HTTP | Retryable | Reaction                                                                 |
| ------------------------------------- | ---: | --------: | ------------------------------------------------------------------------ |
| `AUTOMATION_UNAUTHENTICATED`          |  401 |        no | Stop; send the bearer token.                                             |
| `AUTOMATION_TOKEN_INVALID`            |  401 |        no | Stop; owner must provision/check the account.                            |
| `AUTOMATION_TOKEN_EXPIRED`            |  401 |        no | Stop; owner must issue a new token.                                      |
| `AUTOMATION_TOKEN_REVOKED`            |  401 |        no | Stop and escalate to owner.                                              |
| `AUTOMATION_SCOPE_MISSING`            |  403 |        no | Stop; owner must grant the exact scope.                                  |
| `AUTOMATION_POLICY_DENIED`            |  403 |        no | Do not retry unchanged; inspect policy/quota and escalate if needed.     |
| `AUTOMATION_SITE_NOT_FOUND`           |  404 |        no | Stop; owner must repair the site/account binding.                        |
| `AUTOMATION_NOT_FOUND`                |  404 |        no | Refresh state; do not retry a permanently missing target.                |
| `AUTOMATION_BAD_REQUEST`              |  400 |        no | Fix headers/body/path, then retry once corrected.                        |
| `AUTOMATION_VALIDATION_ERROR`         |  422 |        no | Fix the field/value or destination; do not blind-retry.                  |
| `AUTOMATION_IDEMPOTENCY_CONFLICT`     |  409 |        no | Stop; choose a new key only for a deliberate new payload.                |
| `AUTOMATION_POLICY_APPROVAL_REQUIRED` |  202 |        no | Save `action_id`; wait for human approval.                               |
| `AUTOMATION_RATE_LIMITED`             |  429 |       yes | Back off and honor `Retry-After` when present.                           |
| `AUTOMATION_LIMIT_EXCEEDED`           |  429 |       yes | Back off; reduce request volume or wait for the quota window.            |
| `AUTOMATION_AI_NOT_CONFIGURED`        |  503 |        no | Stop generation and ask the owner to configure a provider.               |
| `AUTOMATION_SLUG_CONFLICT`            |  409 |        no | Choose a different slug or use the publish behavior deliberately.        |
| `AUTOMATION_INTERNAL_ERROR`           |  500 |       yes | Exponential backoff; escalate after repeated failures with `request_id`. |

An admin machine call to a denied route instead returns the non-envelope
`ADMIN_MACHINE_ACCESS_DENIED` / HTTP 403 response shown above.

## 6. Read surfaces and current gaps

The scoped API currently exposes only the summary analytics endpoint. The
following existing admin reads are useful for an owner or a separately
authorized admin integration:

- `GET /api/admin/analytics/summary?days=30`: returns `days`, `totalClicks`,
  `estimatedRevenue`, `avgOrderValue`, `avgOrderValueStatus`, `growthRatePct`,
  `activeProducts`, and `publishedContent`.
- `GET /api/admin/analytics/products?days=30&limit=20`: returns `days` and
  `products`, whose rows contain `product_name`, `click_count`, and
  `estimatedRevenue`.
- `GET /api/admin/affiliate-link-health?limit=50&offset=0`: returns `links`,
  `limit`, and `offset`. Link rows include health columns such as `product_id`,
  `url`, `network`, `last_probed_at`, `last_http_status`, `final_url`,
  `baseline_registrable_domain`, `latency_ms`, `consecutive_failures`,
  `failure_streak_started_at`, and `classification`, plus `product_name` and
  `product_slug`.
- `GET /api/admin/automation/actions`: action history and pending review, as
  described above.

There is no route in the current code for per-product EPC aggregates,
commission-by-network decision data, affiliate-link-health reads through the
scoped automation token, or automation-run history. The daily optimization
cron reads those tables internally; an AI agent cannot reproduce that loop
through the public scoped API today. Do not invent a route or query shape.

## 7. Cron jobs and shared state

Cron routes authenticate with their dedicated secret first and the shared
`CRON_SECRET` fallback second. The scheduled registry is UTC:

| UTC schedule   | Route                                | Secret                               | Purpose                                 |
| -------------- | ------------------------------------ | ------------------------------------ | --------------------------------------- |
| `*/5 * * * *`  | `/api/cron/publish`                  | `CRON_PUBLISH_SECRET`                | Publish scheduled content.              |
| `0 1 * * *`    | `/api/cron/stripe-sync`              | `CRON_STRIPE_SYNC_SECRET`            | Reconcile Stripe state.                 |
| `0 2 * * *`    | `/api/cron/ai-generate`              | `CRON_AI_SECRET`                     | Generate daily AI drafts.               |
| `0 3 * * *`    | `/api/cron/sitemap-refresh`          | `CRON_SITEMAP_SECRET`                | Refresh sitemaps.                       |
| `0 4 * * *`    | `/api/cron/data-retention`           | `CRON_RETENTION_SECRET`              | Retention sweep.                        |
| `0 5 * * *`    | `/api/cron/commission-ingest`        | `CRON_COMMISSION_SECRET`             | Ingest network commissions.             |
| `0 6 * * *`    | `/api/cron/epc-recompute`            | `CRON_EPC_SECRET`                    | Recompute EPC rollups.                  |
| `0 7 * * *`    | `/api/cron/price-scrape`             | `CRON_PRICE_SECRET`                  | Snapshot prices and alerts.             |
| `0 8 * * 1`    | `/api/cron/access-review`            | `CRON_ACCESS_REVIEW_SECRET`          | Weekly access review.                   |
| `0 9 * * *`    | `/api/cron/affiliate-link-health`    | `CRON_AFFILIATE_LINK_HEALTH_SECRET`  | Probe destinations and classify health. |
| `0 10 * * *`   | `/api/cron/affiliate-optimization`   | `CRON_AFFILIATE_OPTIMIZATION_SECRET` | Propose guarded EPC/link optimizations. |
| `0 * * * *`    | `/api/cron/expire-deals`             | `CRON_DEALS_SECRET`                  | Expire deals hourly.                    |
| `*/15 * * * *` | `/api/cron/click-reconcile`          | `CRON_CLICK_RECONCILE_SECRET`        | Reconcile clicks and failures.          |
| `*/10 * * * *` | `/api/cron/homepage-synthetic-check` | `CRON_HOMEPAGE_SYNTHETIC_SECRET`     | Detect empty homepages.                 |

The affiliate optimization loop uses an active site-bound account with
`products:update`, skips stale EPC data (older than 48 hours), and proposes at
most five product actions per run. Its priority is broken/suspicious
destination, winner promotion, then dead-weight archive. URL changes and
archives land in `manual_attention`; `products.update` can auto-apply when
policy allows. It uses clicks/EPC only because there are no product
impressions/views. See [affiliate optimization details](./affiliate-optimization.md).

## 8. Worked example: propose, approve, verify

1. The owner provisions an account with `products:update` and
   `affiliate:status`, then stores the returned `plain_token`.
2. The agent verifies its binding:

   ```bash
   curl "$BASE/api/automation/v1/health" \
     -H "Authorization: Bearer $AUTOMATION_TOKEN"
   ```

3. The agent reads the available summary:

   ```bash
   curl "$BASE/api/automation/v1/analytics/summary" \
     -H "Authorization: Bearer $AUTOMATION_TOKEN"
   ```

   Per-product EPC and link-health data are not currently exposed to this
   token, so the agent must not pretend that this summary is an EPC table.
   An owner-authorized integration can inspect the admin read surfaces in
   [Read surfaces](#6-read-surfaces-and-current-gaps).

4. Given a verified product UUID and a validated destination, the agent
   proposes a URL change with a fresh key:

   ```bash
   curl -X POST "$BASE/api/automation/v1/products/PRODUCT_UUID/affiliate-url" \
     -H "Authorization: Bearer $AUTOMATION_TOKEN" \
     -H "content-type: application/json" \
     -H "Idempotency-Key: affiliate-url-2026-08-12-product" \
     -d '{"affiliate_url":"https://network.example/merchant?tag=ours"}'
   ```

5. Default policy returns HTTP 202:

   ```json
   {
     "ok": false,
     "error": {
       "code": "AUTOMATION_POLICY_APPROVAL_REQUIRED",
       "message": "approval required during observation phase",
       "retryable": false,
       "details": { "action_id": "ACTION_UUID" }
     },
     "meta": {
       "request_id": "REQ_UUID",
       "api_version": "1",
       "action_id": "ACTION_UUID"
     }
   }
   ```

   No executor runs and the product remains unchanged.

6. The owner reviews it:

   ```bash
   curl "$BASE/api/admin/automation/actions?status=manual_attention" \
     -H "Authorization: Bearer $HUMAN_ADMIN_TOKEN"
   ```

   A human session approves it:

   ```bash
   curl -X POST "$BASE/api/admin/automation/actions/ACTION_UUID/approve" \
     -H "Authorization: Bearer $HUMAN_ADMIN_TOKEN"
   ```

   Approval executes the registered product executor, records
   `before_snapshot` and `after_snapshot`, and returns the updated action.

7. Verify through an owner-authorized product/admin read, or through the next
   scoped product read when that endpoint is added. If the action must be
   undone, the owner calls rollback; rollback refuses if the product no longer
   matches the action's after snapshot.

## 9. Contract maintenance

`openapi.yaml` is generated by `npm run generate:openapi` from
`lib/api-route-metadata.ts` and `lib/api-contract-schema.ts`. The OpenAPI file
currently represents health, context, analytics summary, content list,
draft creation, runs, and service-account admin routes, but it does **not**
represent the newer generate, draft-by-ID, publish, product, or
owner action routes. This guide intentionally follows the route handlers where
OpenAPI is incomplete. Adding those operations to the metadata/contracts and
regenerating the spec is a separate API-contract task; this docs-only change
does not modify runtime or OpenAPI files.

For the older overlapping material, see:

- [Admin API machine access](./admin-api-machine-access.md) — authentication
  background and this guide's denial contract.
- [Affiliate optimization](./affiliate-optimization.md) — cron decision rules.
