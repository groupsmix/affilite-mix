# Terraform IaC Migration Plan — Dashboard-Routed Domains

> **A206 Remediation** — Migrate manually configured Cloudflare DNS records and Worker routes to IaC.
> **Status:** Plan documented; execution pending.
> **Last updated:** 2026-05-30

---

## 1. Problem Statement

Some Cloudflare DNS records and Worker routes were created via the Cloudflare Dashboard rather than through Terraform. This creates:

- **Drift risk:** Dashboard changes are not tracked in version control and can be overwritten by `terraform apply`.
- **No audit trail:** Dashboard changes lack the PR review, approval, and CODEOWNERS enforcement that Terraform changes receive.
- **Blast radius:** An attacker with dashboard access (even read-only) can enumerate all routes; IaC-managed routes are visible in the repo but protected by PR review.

---

## 2. Current State Audit

### 2a. Identify Dashboard-Routed Resources

Run the following to compare Terraform state with actual Cloudflare configuration:

```bash
# List all DNS records from Cloudflare API
curl -s "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result[] | {name, type, content}'

# Compare with Terraform state
cd terraform/cloudflare
terraform state list | grep cloudflare_record

# Diff: any records in the API output but NOT in Terraform state are dashboard-routed
```

### 2b. Identify Dashboard-Created Worker Routes

```bash
# List all Worker routes
curl -s "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result[] | {pattern, script}'

# Compare with Terraform
terraform state list | grep cloudflare_worker_route
```

---

## 3. Migration Procedure

For each dashboard-routed resource:

1. **Import into Terraform state:**

   ```bash
   terraform import cloudflare_record.<resource_name> <zone_id>/<record_id>
   ```

2. **Write the corresponding `.tf` resource block** to match the imported state.

3. **Run `terraform plan`** — confirm no changes (the imported state matches reality).

4. **Submit as a PR** with `@groupsmix/security` review (CODEOWNERS enforced).

5. **After merge:** Verify `terraform apply` produces no changes.

---

## 4. Terraform State Security (A209)

### 4a. State File Protection

- Terraform state contains sensitive values (API tokens, secret references). Store state in a remote backend with encryption:
  - **Recommended:** Terraform Cloud (free for up to 5 users) or Cloudflare R2 with encryption.
  - **Current:** Verify where state is stored (`terraform/cloudflare/backend.tf`).

- [ ] Enable state encryption at rest.
- [ ] Restrict state access to the CI/CD pipeline and the security lead.
- [ ] Enable state locking to prevent concurrent modifications.

### 4b. Plan/Apply Separation

- `terraform plan` runs in CI on every PR (read-only, safe).
- `terraform apply` runs only on merge to `main` (or via manual approval for production changes).
- Never run `terraform apply` locally — always through CI.

---

## 5. Action Items

- [ ] Run the audit commands in §2 to identify all dashboard-routed resources.
- [ ] Import each resource into Terraform (§3).
- [ ] Verify `terraform plan` shows zero drift after import.
- [ ] Document state backend configuration (§4a).
- [ ] Set up CI pipeline for `terraform plan` on PRs (if not already in place).
- [ ] Schedule quarterly drift check (add to `docs/shadow-it-discovery.md` §1d).
