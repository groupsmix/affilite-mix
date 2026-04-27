# Migration History Notes

## Gaps in Migration Numbering

The following migration prefix numbers are intentionally absent:

### 00058

This prefix was never used. The migration that was planned for this slot was deferred and eventually landed as part of `00059_pg_trgm_indexes.sql`.

### 00063

This prefix was skipped during development. The feature it was reserved for (additional RLS hardening) was merged into `00064_tenant_isolation_rls.sql` instead.

## Previously Colliding Prefixes (Resolved)

The following prefixes previously had two migration files sharing the same number. They were renumbered to eliminate filesystem-sort ambiguity on fresh DB provisioning:

| Original Prefix | File                                     | New Prefix |
| --------------- | ---------------------------------------- | ---------- |
| 00038           | `reintroduce_public_rls.sql`             | 00074      |
| 00039           | `drop_legacy_public_select_policies.sql` | 00075      |
| 00070           | `deals_site_id_index.sql`                | 00076      |

The file contents are identical to the originals. Only the numeric prefix changed.
