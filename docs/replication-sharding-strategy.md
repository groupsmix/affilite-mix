# Replication & Sharding Strategy

> **Status:** Single-primary PostgreSQL (Supabase)
> **Shard key:** `site_id`
> **Migration path:** Documented below

## A30-001: Current Architecture

The application currently runs on a **single-primary PostgreSQL** via Supabase. There is no explicit sharding, replica routing, or shard key configuration in the application code. This document records the current assumption and the migration path when scaling is needed.

### Single-Primary Assumptions

- All reads and writes go to the same primary database
- No read-after-write lag concerns (writes are immediately visible)
- No cross-shard transaction concerns (single database)
- Tenant data is colocated (all sites in one database)

## A30-002: Read-After-Write Consistency

When replicas are introduced, the following strategies apply:

| Strategy              | Use Case                         | Implementation                                          |
| --------------------- | -------------------------------- | ------------------------------------------------------- |
| **Primary reads**     | After write, then immediate read | `readAfterWrite()` in `lib/read-after-write.ts`         |
| **Versioned cache**   | Cache invalidation after write   | Tag-based revalidation in `app/api/revalidate/route.ts` |
| **Bounded staleness** | Reporting queries                | `boundedStalenessRead()` helper                         |

### Critical Paths Requiring Primary Reads

1. **Authorization** (`hasPermission`): MUST use primary reads
2. **Site membership resolution** (`getTenantClient`): MUST use primary reads
3. **Price updates**: Should use primary read to show updated price immediately
4. **Content publishing**: Cron uses primary DB `now()` for scheduling

## A30-004: Hotspot Mitigation

A single high-traffic tenant can create write hotspots on:

- `ad_impressions` (daily aggregate rows)
- `affiliate_clicks` (insert-heavy)
- `product_epc_stats` (update-heavy during recomputation)

### Mitigation Strategies

1. **site_hash column**: `ad_impressions.site_hash` distributes writes via a hash of `site_id` for future partitioning
2. **Buffered queue aggregation**: Impression writes can be buffered in a queue and flushed as batch upserts
3. **Time-bucket partitioning**: Partition `ad_impressions` by `impression_date` for older data
4. **Read replicas for reporting**: Analytics queries can read from replicas with bounded staleness

## A30-005: Cross-Shard Transaction Policy

When sharding is introduced:

- **Shard key:** `site_id` — all data for a site lives on one shard
- **Cross-site transactions are prohibited** — any operation touching multiple sites must use saga/2PC patterns
- **Design rule:** Every table that is site-scoped includes `site_id` as the shard key prefix

### Tables by Shardability

| Table                    | Shard Key | Notes                                               |
| ------------------------ | --------- | --------------------------------------------------- |
| `sites`                  | Global    | Small table, replicated to all shards or global     |
| `products`               | `site_id` | Site-scoped                                         |
| `content`                | `site_id` | Site-scoped                                         |
| `categories`             | `site_id` | Site-scoped                                         |
| `affiliate_clicks`       | `site_id` | Site-scoped                                         |
| `ad_impressions`         | `site_id` | Site-scoped (plus `site_hash` for sub-partitioning) |
| `commissions`            | `site_id` | Site-scoped                                         |
| `admin_users`            | Global    | Cross-site role, global table                       |
| `admin_site_memberships` | `site_id` | Site-scoped (links global user to site)             |

## A30-006: Replica Lag Handling

When read replicas are introduced:

| Query Type                       | Required Consistency | Route                            |
| -------------------------------- | -------------------- | -------------------------------- |
| Authorization/membership         | Strict               | Primary                          |
| Product/content read after write | Strict               | Primary                          |
| Public catalog listing           | Eventual             | Replica (with bounded staleness) |
| Analytics/reporting              | Bounded staleness    | Replica                          |
| Click tracking write             | N/A                  | Primary                          |

Implementation: `lib/read-after-write.ts` provides `authzPrimaryRead()`, `readAfterWrite()`, and `boundedStalenessRead()` helpers.

## A30-007: Disaster Recovery

### RTO/RPO Targets

| Metric | Target       | Notes                                    |
| ------ | ------------ | ---------------------------------------- |
| RPO    | < 5 minutes  | Point-in-time recovery via WAL archiving |
| RTO    | < 30 minutes | Automated failover with Supabase HA      |

### Failover Process

1. **Detection**: Health checks on primary DB every 30 seconds
2. **Promotion**: Supabase automated promotion of standby to primary
3. **Redirect**: Update `NEXT_PUBLIC_SUPABASE_URL` (or use Supabase connection pooler which handles failover)
4. **Verification**: Run `scripts/dr-restore-test.sh` to validate table counts and basic connectivity

### Restore Testing

Run `scripts/dr-restore-test.sh` regularly to verify:

- Table count matches expected
- Key tables are accessible
- RLS policies are active

### DR Drills

Recommended: Quarterly failover drills with measured RPO/RTO.

### Backup Strategy

- Supabase daily automated backups
- pg_dump to R2 for cross-region cold storage
- WAL archiving for point-in-time recovery
