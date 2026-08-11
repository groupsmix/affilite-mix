# Documentation

## Table of Contents

### Deployment

- [Cloudflare Deployment](./CLOUDFLARE.md) - Single source of truth for deployment (account IDs, bindings, secrets, runbook)
- [Rollback Strategy](./rollback-strategy.md) - How to roll back deployments
- [Backup Strategy](./backup-strategy.md) - Database backup and restore procedures
- [Release Process](./release-process.md) - Release workflow and checks

### Security

- [Security Policy](../SECURITY.md) - Security practices and supported versions
- [RLS Policy Inventory](./public-rls-inventory.md) - Database RLS policy documentation
- [Secrets Rotation Runbook](./secrets-rotation-runbook.md) - Per-secret rotation procedures
- [Admin API Machine Access](./admin-api-machine-access.md) - Bearer tokens for scripts and AI agents

### SRE / Operations

- [Alerting Runbook](./alerting-runbook.md) - How to respond to alerts
- [Incident Response](./incident-response.md) - Production incident detection and triage
- [Observability Runbook](./observability-runbook.md) - Monitoring and observability
- [DR Runbook](./DR-RUNBOOK.md) - Disaster recovery procedures

### Architecture

- [Architecture Overview](./architecture.md) - System architecture
- [Multi-Site Architecture](./multi-site-architecture.md) - Multi-tenant site resolution and routing
- [Cache Topology](./CACHE-TOPOLOGY.md) - Caching strategy and layers

### Development

- [Local Supabase](./local-supabase.md) - Setting up Supabase locally
- [UI Conventions](./ui-conventions.md) - Component and styling conventions
- [Migration Safety](./migration-safety.md) - Database migration guidelines
- [npm Overrides](./npm-overrides.md) - Rationale for dependency overrides
