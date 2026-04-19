# One-Click Deploy Guide

This guide will get your entire platform live in **one workflow run** — database, worker, domains, admin user, everything.

## Prerequisites

Before starting, make sure you have:

- [ ] A **Supabase** account with a project created (free tier works)
- [ ] A **Cloudflare** account (free)
- [ ] Your domain added to Cloudflare (if using a custom domain)

## What You Need to Gather (4 things)

| Credential                | Where to Get It                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase Access Token** | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token                     |
| **Supabase DB Password**  | The password you set when creating your Supabase project                                                                        |
| **Cloudflare API Token**  | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token (see permissions below) |
| **Cloudflare Account ID** | Cloudflare dashboard → any domain → Overview → right sidebar                                                                    |

### Cloudflare API Token Permissions

When creating your Cloudflare API Token, use the **"Edit Cloudflare Workers"** template, then add:

| Permission                   | Access |
| ---------------------------- | ------ |
| Account → Workers Scripts    | Edit   |
| Account → Workers KV Storage | Edit   |
| Account → Workers R2 Storage | Edit   |
| Zone → DNS                   | Edit   |
| Zone → Zone                  | Read   |

## Deploy (One Click)

1. Go to your GitHub repo → **Actions** tab
2. Click **"🚀 One-Click Complete Setup"** in the left sidebar
3. Click **"Run workflow"**
4. Fill in the form:
   - **Supabase Access Token** — paste your token
   - **Supabase DB Password** — your database password
   - **Cloudflare API Token** — paste your token
   - **Cloudflare Account ID** — paste your account ID
   - **Admin email** — your email for the admin panel
   - **Admin password** — pick a password (or leave empty to auto-generate)
   - **Primary domain** — your domain (e.g., `wristnerd.xyz`) or leave empty
   - **GitHub PAT** — optional, enables auto-deploy on future pushes
5. Click the green **"Run workflow"** button
6. Wait ~10 minutes

That's it. The workflow will:

1. Auto-detect your Supabase project and fetch all API keys
2. Apply all database migrations
3. Create the Cloudflare R2 bucket and KV namespace
4. Build the Next.js app
5. Deploy to Cloudflare Workers
6. Set all Worker environment secrets
7. Configure your custom domains
8. Create your admin user
9. Save all secrets to GitHub (if you provided a PAT)
10. Run a health check

## After Setup

Visit your sites:

- `https://your-domain.com` — your main site
- `https://your-domain.com/admin` — admin panel (log in with the email/password from the workflow)

## Enable Auto-Deploy on Push

If you provided a **GitHub PAT** during setup, pushing to `main` will automatically redeploy:

```bash
git push origin main
# → GitHub Actions auto-deploys to Cloudflare
```

If you didn't provide a PAT, you can either:

- Re-run the One-Click Setup with a PAT
- Manually add secrets in GitHub → Settings → Secrets and variables → Actions

### Creating a GitHub PAT

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Select the **`repo`** scope
4. Copy the token and paste it in the workflow's **GitHub PAT** field

## Re-Running the Setup

The workflow is **safe to re-run** at any time. All steps are idempotent:

- New migrations are applied; already-applied ones are skipped
- R2 buckets and KV namespaces are reused if they exist
- The app is rebuilt and redeployed
- Worker secrets are updated
- Admin user is upserted (updated if exists)

## Troubleshooting

| Problem                            | Solution                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| "No active Supabase project found" | Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) first |
| "Cannot connect to database"       | Check your DB password is correct                                                  |
| "Cloudflare deploy failed"         | Check your API token has all required permissions (see above)                      |
| Site shows "DNS not found"         | Wait 5–30 minutes for DNS propagation                                              |
| "KV namespace error"               | Usually means it already exists — safe to ignore                                   |

## Workflow Reference

| Workflow                        | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| **🚀 One-Click Complete Setup** | Full end-to-end setup (run this first)             |
| **🚀 Deploy to Cloudflare**     | Redeploy after code changes (auto on push to main) |
| **🚀 Setup Domains**            | Add or change custom domains                       |
| **✅ Verify Setup**             | Check all secrets and connections are working      |
