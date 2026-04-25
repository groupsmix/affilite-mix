# Backup Policy

## RPO and RTO Targets
- **Recovery Point Objective (RPO)**: 24 hours (daily PITR)
- **Recovery Time Objective (RTO)**: 4 hours for full platform restoration

## Database Backups (Supabase)
- **Automated Backups**: Supabase performs daily automated backups with 7-day retention.
- **Point in Time Recovery (PITR)**: Enabled for Production, allowing restoration to any minute within the last 7 days.
- **Logical Dumps**: A GitHub Actions cron job exports a logical `pg_dump` daily and stores it in Cloudflare R2 for off-site redundancy.

## Object Storage (R2)
- Images and uploads are stored in Cloudflare R2.
- Versioning is enabled on the primary bucket to protect against accidental deletion.
- A secondary bucket (`backup-assets`) receives a weekly sync via Cloudflare Workers cron.

## Code and Infrastructure
- All infrastructure is managed via Terraform and GitHub Actions.
- Source code is hosted on GitHub.
