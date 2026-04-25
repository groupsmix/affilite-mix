# Disaster Recovery Runbook

## Scenario: Supabase Project is Gone (Data Loss)

### Prerequisites
- Supabase CLI installed
- Access to Cloudflare Dashboard
- Access to the GitHub repository

### Steps

1. **Provision a New Database**
   - Create a new Supabase project in the Supabase Dashboard.
   - Note the new `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

2. **Restore from Backup**
   - Download the latest logical backup from Cloudflare R2 (`backup-bucket`).
   - Use the Supabase CLI or `psql` to restore the schema and data:
     ```bash
     psql -h aws-0-us-east-1.pooler.supabase.com -U postgres.new_project_id -d postgres -f backup.sql
     ```
   - Alternatively, apply migrations and seed data:
     ```bash
     supabase db push --db-url "postgresql://postgres:password@host/postgres"
     ```

3. **Update Secrets**
   - Update Cloudflare Worker secrets via `wrangler secret put`:
     ```bash
     wrangler secret put NEXT_PUBLIC_SUPABASE_URL
     wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
     wrangler secret put SUPABASE_SERVICE_ROLE_KEY
     ```
   - Update GitHub Actions secrets if CI/CD needs the new DB URL.

4. **Verify Connectivity**
   - Run the health check endpoint: `curl https://your-worker-domain.workers.dev/api/health`
   - Run automated E2E tests: `npm run e2e`

5. **DNS Cutover** (If applicable)
   - Ensure Cloudflare DNS points to the updated Worker.
