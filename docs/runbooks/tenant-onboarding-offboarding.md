# Runbook: Tenant (Site) Onboarding and Offboarding

## Onboarding a New Site

### 1. Add Static Configuration (if needed)

For sites managed via static config, create a new file in `config/sites/`:

```bash
npm run add-site
```

This runs `scripts/add-site.ts` which prompts for site details and creates the config file.

### 2. Add Database Record

The site must exist in the `sites` table. Use the seed script or insert manually:

```sql
INSERT INTO sites (slug, name, domain, language, direction, is_active)
VALUES ('new-site', 'New Site', 'newsite.example.com', 'en', 'ltr', true);
```

### 3. Configure DNS

Add a CNAME record pointing the site domain to the Cloudflare Worker:

```bash
# Via Terraform
cd terraform/cloudflare
terraform apply -var="zone_domain=example.com"

# Or via Cloudflare Dashboard
# DNS > Add Record > CNAME > new-site.example.com -> affilite-mix.workers.dev
```

### 4. Configure Admin Access

Create admin user memberships for the new site:

```sql
INSERT INTO admin_site_memberships (user_id, site_id, role)
SELECT au.id, s.id, 'admin'
FROM admin_users au, sites s
WHERE au.email = 'admin@example.com' AND s.slug = 'new-site';
```

### 5. Verify

```bash
curl -s https://newsite.example.com/api/health | jq .
```

## Offboarding (Deactivating) a Site

### 1. Deactivate the Site

```bash
npm run pause-site
```

Or directly:

```sql
UPDATE sites SET is_active = false WHERE slug = 'site-to-deactivate';
```

### 2. Verify Deactivation

- The middleware will return 404 for requests to the deactivated domain
- Admin users will no longer see the site in the site selector

### 3. Data Retention

- Site data (content, products, categories) remains in the database
- Affiliate click data remains for historical reporting
- Newsletter subscribers remain but no new confirmations will be sent
- R2 uploaded media remains

### 4. Complete Removal (if needed)

If the site needs to be permanently removed:

```sql
-- WARNING: CASCADE will delete all related data
DELETE FROM sites WHERE slug = 'site-to-remove';
```

This cascades to: categories, products, content, content_products, affiliate_clicks, newsletter_subscribers, ad_placements, ad_impressions, deals, price_snapshots, price_alerts, community content, memberships, quizzes, and more.

### 5. DNS Cleanup

Remove the DNS record for the deactivated domain.

### 6. R2 Cleanup

Uploaded media is not automatically cleaned up. Use the R2 orphan cleanup procedure to remove objects belonging to deleted sites.
