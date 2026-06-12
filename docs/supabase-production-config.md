# Supabase Production Configuration

> **Due Diligence Artifact (E2-06)**
> **Last Updated:** 2026-06-12
> **Purpose:** Document Supabase production configuration for scale planning and due diligence

## Project Details

| Property           | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Project Ref**    | `odgtwjkzwciohhhqdtti`                                       |
| **Region**         | `eu-central-1` (Frankfurt, Germany)                          |
| **Data Residency** | EU (GDPR Adequacy)                                           |
| **DPA Status**     | Executed via Enterprise contract (see `docs/vendor-dpas.md`) |

## Connection Pooler Configuration

| Setting                    | Value       | Source                 |
| -------------------------- | ----------- | ---------------------- |
| **Enabled**                | Yes         | `supabase/config.toml` |
| **Mode**                   | Transaction | `supabase/config.toml` |
| **Port**                   | 6543        | `supabase/config.toml` |
| **Default Pool Size**      | 20          | `supabase/config.toml` |
| **Max Client Connections** | 500         | `supabase/config.toml` |

## Database Configuration

| Setting           | Value                        | Source                 |
| ----------------- | ---------------------------- | ---------------------- |
| **Major Version** | 15                           | `supabase/config.toml` |
| **Port**          | 54322 (local), 6543 (pooler) | `supabase/config.toml` |

## Blind Spots (Information Not Available in Codebase)

The following configuration details are not documented in the codebase and must be obtained from the Supabase Dashboard:

- **Plan/Tier** (Free, Pro, Enterprise)
- **Replica Configuration** (read replicas enabled/disabled)
- **PITR Settings** (Point-in-Time Recovery retention period)
- **Backup Retention** (automated backup retention period)
- **Connection Cap** (hard limit on concurrent connections)
- **Compute Add-ons** (RAM/CPU allocation)
- **Storage Quota** (database storage limit)

## Migration Status

- **Migration Count:** 250+ migrations (see `supabase/migrations/`)
- **Schema Sync:** Aligned as of 2026-04-21 (verified via `supabase migration list`)
- **Drift Check:** Manual via `scripts/check-schema-drift.sh` (not wired to CI)

## Security Configuration

- **RLS Enabled:** Yes (see `docs/public-rls-inventory.md`)
- **Service Role Key:** Stored in Cloudflare Worker secrets only
- **Network Restrictions:** Configured in Supabase Dashboard (see `docs/data-residency.md`)
- **Auth Providers:** Email (signups disabled), OAuth (configured in dashboard)

## References

- `docs/supabase.md` - Migration workflow and source of truth
- `docs/data-residency.md` - Data residency and GDPR compliance
- `docs/vendor-dpas.md` - Supabase DPA and sub-processor list
- `docs/threat-model.md` - Security posture and known risks
- `supabase/config.toml` - Local development configuration
