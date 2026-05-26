# Soft-Delete Policy

> **Applies to:** Sites, Products, Content, Categories
> **Status:** Active

## A27-001: Deletion Semantics

### Sites

| Operation                    | Function           | Required Role      | Effect                                                           |
| ---------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------- |
| **Soft delete (deactivate)** | `deactivateSite()` | Any admin          | `is_active = false` — site hidden from public, admin can restore |
| **Hard delete**              | `deleteSite()`     | `super_admin` only | Permanent removal — cascades to all related data                 |

**Rule:** Regular admins MUST use `deactivateSite()`. Hard delete is restricted to `super_admin` for maintenance only.

### Products

| Status     | Meaning          | Visibility                                     |
| ---------- | ---------------- | ---------------------------------------------- |
| `draft`    | Work in progress | Admin only                                     |
| `active`   | Live and visible | Public                                         |
| `archived` | Soft-deleted     | Admin only, preserved for historical reporting |

**Rule:** Use `status = 'archived'` for deletion. Hard delete only via `super_admin`.

### Content

| Status      | Meaning                           | Visibility |
| ----------- | --------------------------------- | ---------- |
| `draft`     | Work in progress                  | Admin only |
| `review`    | Pending editorial review          | Admin only |
| `scheduled` | Will auto-publish at `publish_at` | Admin only |
| `published` | Live and visible                  | Public     |
| `archived`  | Soft-deleted                      | Admin only |

## A27-003: Query Consistency

### Public DAL Methods

Public-facing DAL methods enforce these filters by default:

- **Products**: `status = 'active'`
- **Content**: `status = 'published'`
- **Sites**: `is_active = true`

### Admin DAL Methods

Admin methods (suffixed with `Admin` or in `lib/dal/admin-*.ts`) can view all states but should still filter when appropriate.

### Method Naming Convention

| Suffix      | Visibility        | Filters                                 |
| ----------- | ----------------- | --------------------------------------- |
| (no suffix) | Context-dependent | Depends on caller                       |
| `Public`    | Public/anonymous  | Enforces active/published filters       |
| `Admin`     | Admin only        | No status filters, may include archived |

## A27-005: Historical Reporting Semantics

### Affiliate Clicks

The `affiliate_clicks` table intentionally stores snapshots of `product_name` and `affiliate_url` at click time. These values:

- **Are NOT updated** when products change
- **Preserve historical state** for accurate analytics
- **Are necessary** because products may be edited, renamed, or deleted after clicks occur

### Commission Reports

The `commissions.raw_data` JSONB column stores the original network report. This is:

- **Encrypted at application layer** (PII redaction required)
- **Read-only after ingestion** — never modified
- **Subject to retention policy** (see Data Retention below)

### Data Retention

| Data Type              | Retention | Action After                            |
| ---------------------- | --------- | --------------------------------------- |
| Affiliate clicks       | 2 years   | Anonymize and archive                   |
| Commission raw_data    | 90 days   | Delete raw JSON, keep normalized fields |
| Ad impressions (daily) | 1 year    | Aggregate to monthly, delete daily      |
| Audit log              | 1 year    | Archive to cold storage                 |

## Query Patterns

### Public Product Listing

```typescript
// Correct — public method enforces active filter
const products = await listActiveProducts(siteId);
```

### Admin Product View (including archived)

```typescript
// Admin method — no status filter
const product = await getProductByIdAdmin(siteId, id);
```

### Historical Click Report

```typescript
// Clicks include archived products by design
const clicks = await getRecentClicks(siteId);
// product_name in click row reflects name at time of click, not current product name
```
