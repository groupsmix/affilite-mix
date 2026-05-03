# Documentation

## Table of Contents

### Deployment

- [Deployment Guide](./deployment.md) - Production deployment instructions
- [Rollback Strategy](./rollback-strategy.md) - How to roll back deployments
- [Backup Strategy](./backup-strategy.md) - Database backup and restore procedures
- [Migration History](./migration-history.md) - Database migration changelog
- [Migration Safety](./migration-safety.md) - Migration best practices and guards

### Security

- [Security Policy](../SECURITY.md) - Security practices and supported versions
- [RLS Policy Inventory](./public-rls-inventory.md) - Database RLS policy documentation
- [Threat Model](./threat-model.md) - System threat model
- [Incident Response](./incident-response.md) - Incident response procedures
- [Secrets Rotation](./secrets-rotation-runbook.md) - How to rotate secrets

### SRE / Operations

- [Alerting Runbook](./alerting-runbook.md) - How to respond to alerts (includes per-alert remediation)
- [Health Checks](./health-checks.md) - `/api/health` endpoint details
- [DR Runbook](./DR-RUNBOOK.md) - Disaster recovery procedures
- [DR Drill Checklist](./dr-drill-checklist.md) - Disaster recovery drill steps
- [SLO Definitions](./slo-definitions.md) - Service level objectives
- [Observability Runbook](./observability-runbook.md) - Logging and monitoring setup

### Architecture

- [Architecture Overview](./architecture.md) - System architecture
- [Architecture Data Flow](./architecture-data-flow.md) - Data flow diagrams
- [Site Context](./site-context.md) - Multi-tenant site resolution
- [Feature Flags](./feature-flags.md) - Feature flag system documentation
- [Cloudflare](./CLOUDFLARE.md) - Cloudflare Workers deployment details
- [Multi-Site Architecture](./multi-site-architecture.md) - Multi-tenant design

### Architecture Decision Records (ADRs)

- [ADR-0001: Cloudflare Workers + OpenNext](./adr/0001-cloudflare-workers-opennext.md)
- [ADR-0002: bcrypt-to-PBKDF2 Transparent Upgrade](./adr/0002-bcrypt-pbkdf2-transparent-upgrade.md)
- [ADR-0003: Per-Tenant DO Rate Limiter](./adr/0003-per-tenant-do-rate-limiter.md)
- [ADR-0004: No i18n Library](./adr/0004-no-i18n-library.md)
- [ADR-0005: Service Role Gateway](./adr/0005-service-role-gateway.md)
- [ADR-0006: CSP Nonces over Hashes](./adr/0006-csp-nonces-over-hashes.md)
- [ADR-0007: Separate Heavy Crons Worker](./adr/0007-separate-heavy-crons-worker.md)

### Runbooks

- [AI Provider Failover](./runbooks/ai-provider-failover.md)
- [Click DLQ](./runbooks/click-dlq.md)
- [Database Migration Rollback](./runbooks/database-migration-rollback.md)
- [R2 Orphan Cleanup](./runbooks/r2-orphan-cleanup.md)
- [Supabase Connection Pool Exhaustion](./runbooks/supabase-connection-pool-exhaustion.md)
- [Tenant Onboarding / Offboarding](./runbooks/tenant-onboarding-offboarding.md)

### Compliance

- [SOC 2 Controls Mapping](./soc2-controls-mapping.md)
- [Separation of Duties Matrix](./sod-matrix.md)
- [ROPA](./ropa.md) - Record of Processing Activities
- [Vendor DPAs](./vendor-dpas.md) - Data Processing Agreements

### Development

- [Local Development](./local-dev.md) - Setting up local development environment
- [Testing](./testing.md) - Running tests and CI pipelines
- [Environment Variables](./environment-variables.md) - Required env vars reference
- [UI Conventions](./ui-conventions.md) - Frontend coding conventions
