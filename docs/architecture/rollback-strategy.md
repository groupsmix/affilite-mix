# Rollback Strategy (App and DB)

## Deploy Workflow
The deployment pipeline (`.github/workflows/deploy.yml`) separates stages:
1. Validate on Staging DB
2. Snapshot Prod DB
3. Apply DB migrations
4. Verify Schema
5. Deploy App
6. Promote Traffic

## App Rollback
If a defect is identified after step 6:
- **Cloudflare Workers:** Rollback is instant. Use Wrangler CLI `wrangler rollback <deployment-id>` or the Cloudflare dashboard to revert traffic to the previous deployment.

## Database Rollback
If the DB migration causes errors:
- **Forward-Compatible Migrations:** All schema changes must use the expand/contract pattern. Old app code must be able to run against the new schema.
- **Immediate Mitigation:** If the database migration itself corrupts data or locks tables excessively:
  1. Trigger the `-down.sql` migration script from Supabase CLI.
  2. If the data is permanently damaged, restore from the Snapshot taken in Step 2 (RTO < 5m).

Traffic promotion can be paused manually if `deploy` steps require explicit approval.
