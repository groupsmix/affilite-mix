# 🚀 One-Click Deploy Guide

This guide will get your site live on **wristnerd.xyz** in minutes with minimal effort.

## ✅ Prerequisites

Before starting, make sure you have:
- [ ] Domain `wristnerd.xyz` purchased (Namecheap, GoDaddy, Cloudflare, etc.)
- [ ] Cloudflare account (free)
- [ ] Supabase project created (free tier works)
- [ ] GitHub repository with your code

## 📋 Step 1: Add GitHub Secrets (ONE TIME SETUP)

Go to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

Add these secrets one by one:

### Required Secrets

| Secret Name | Where to Get It | Example Value |
|-------------|-----------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → Use "Edit Cloudflare Workers" template | `abc123...` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar | `1a2b3c4d...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API (service_role key) | `eyJhbG...` |
| `JWT_SECRET` | Generate: `openssl rand -hex 64` | `a1b2c3d4...` (64 chars) |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` | `e5f6g7h8...` (32 chars) |

### Optional Secrets (for features)

| Secret | For What |
|--------|----------|
| `RESEND_API_KEY` | Sending emails |
| `SENTRY_DSN` | Error tracking |
| `CLOUDFLARE_AI_API_TOKEN` | AI content generation |
| `GEMINI_API_KEY` | Google AI |
| `CJ_API_KEY` | CJ Affiliate |

## 📋 Step 2: Point Your Domain to Cloudflare

### If you bought domain from Cloudflare:
- ✅ Already done! Skip to Step 3.

### If you bought domain elsewhere (Namecheap, GoDaddy, etc.):

1. Go to your domain registrar
2. Change **nameservers** to:
   ```
   lara.ns.cloudflare.com
   greg.ns.cloudflare.com
   ```
   (Cloudflare will show you the exact nameservers when you add the site)

3. Wait 5-30 minutes for DNS to update

## 📋 Step 3: Deploy! (ONE CLICK)

### Option A: Auto-Deploy on Push (Recommended)
```bash
git add .
git commit -m "ready to deploy"
git push origin main
```

GitHub Actions will automatically deploy! ✅

### Option B: Manual Deploy
1. Go to GitHub → **Actions** tab
2. Click **"🚀 Deploy to Cloudflare"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait 2-3 minutes ⏱️
5. Done! ✅

## 📋 Step 4: Setup Domains (ONE CLICK)

After first deploy, setup your domains:

1. Go to GitHub → **Actions** tab
2. Click **"🚀 Setup Domains (One-Click)"**
3. Click **"Run workflow"** → **"Run workflow"**
4. This will:
   - ✅ Add custom domains to your Cloudflare Worker
   - ✅ Update your Supabase database
   - ✅ Verify everything works

**Or with custom domains:**
```
Run workflow → Enter domains: "cryptoranked.xyz, crypto.wristnerd.xyz"
```

## 📋 Step 5: Check Your Site

Visit these URLs:
- 🌐 https://wristnerd.xyz
- 🌐 https://arabictools.wristnerd.xyz
- 🔐 https://wristnerd.xyz/admin (login page)

## 🔄 Future Deployments

After setup, deploying is automatic:

```bash
git push origin main
```

That's it! 🎉

## 🆘 Troubleshooting

### "Site not found" error
- Domain DNS not propagated yet → Wait 5-10 minutes
- Check GitHub Actions logs for errors

### "Database error"
- Check `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check database is running in Supabase dashboard

### "Cloudflare error"
- Check `CLOUDFLARE_API_TOKEN` has correct permissions
- Check `CLOUDFLARE_ACCOUNT_ID` is correct

## 📚 Additional Workflows

| Workflow | When to Use |
|----------|-------------|
| **🚀 Deploy to Cloudflare** | Deploy code changes |
| **🚀 Setup Domains** | Add/change domains |
| **🧪 Run Tests** | Check code before deploying |

## 🎯 What Happens During Deploy?

```
1. GitHub Actions starts
2. Installs dependencies (npm ci)
3. Builds Next.js app
4. Builds Cloudflare Worker bundle
5. Deploys to Cloudflare Workers
6. Sets worker secrets (CRON_SECRET, etc.)
7. Verifies deployment
8. Done! 🎉
```

## 💡 Pro Tips

1. **Always check Actions tab** after push to see if deploy succeeded
2. **First deploy takes longest** (3-5 min), subsequent deploys are faster (1-2 min)
3. **Domain changes need 5-10 min** to propagate globally
4. **Use Setup Domains workflow** anytime you want to add new domains

---

**Questions?** Check the logs in GitHub Actions for detailed error messages.
