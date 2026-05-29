# Continuous Attack Surface Management (ASM)

> **A206/A213 Remediation** — Scheduled ASM diff and Dashboard-routed domain tracking.
> **Last updated:** 2026-05-29

---

## 1. Problem

- Two domains (`cryptoranked.xyz`, `aicompared.site`) are routed via the Cloudflare Dashboard, **not** managed by Terraform IaC (`terraform/cloudflare/dns.tf`). This creates configuration drift risk (A206).
- No automated daily diff alerts for new ports, subdomains, or certificates appearing on the attack surface (A213).

---

## 2. Dashboard-Routed Domains (A206)

The following domains are currently configured via the Cloudflare Dashboard and are **not** in `terraform/cloudflare/dns.tf`:

| Domain             | Routing Method         | Reason Not in IaC                | Risk                                  | Action                                                  |
| ------------------ | ---------------------- | -------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `cryptoranked.xyz` | Dashboard Worker Route | Legacy setup before IaC adoption | Medium — config drift, no audit trail | Migrate to Terraform `cloudflare_workers_custom_domain` |
| `aicompared.site`  | Dashboard Worker Route | Legacy setup before IaC adoption | Medium — config drift, no audit trail | Migrate to Terraform `cloudflare_workers_custom_domain` |

### Migration Plan

1. Use `scripts/cf-security-snapshot.sh` to dump current custom domain and DNS configuration.
2. Import existing resources into Terraform state:
   ```bash
   terraform import 'cloudflare_workers_custom_domain.worker_domains["cryptoranked.xyz"]' \
     "${var.cloudflare_account_id}/<custom-domain-id>"
   terraform import 'cloudflare_workers_custom_domain.worker_domains["aicompared.site"]' \
     "${var.cloudflare_account_id}/<custom-domain-id>"
   ```
3. Add the domains to the `worker_custom_domains` variable in `terraform.tfvars`.
4. Run `terraform plan` to verify no unexpected changes.
5. Apply and verify routing still works.

### Action Items

- [ ] Export current Dashboard Worker Routes for both domains
- [ ] Import into Terraform state
- [ ] Add to `dns.auto.tfvars` or `terraform.tfvars`
- [ ] Verify with `terraform plan` (no-op expected)
- [ ] Remove Dashboard-only routes after Terraform manages them

---

## 3. Scheduled ASM Diff (A213)

### What to Monitor

| Asset Type            | Source of Truth                      | Monitor For                                                        |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| DNS records           | `terraform/cloudflare/dns.tf`        | New/modified records not in IaC                                    |
| Worker custom domains | `terraform/cloudflare/dns.tf`        | New domains added via Dashboard                                    |
| Subdomains            | Certificate Transparency logs        | New certs issued for `*.wristnerd.xyz`, `*.cryptoranked.xyz`, etc. |
| Open ports            | External scan (e.g., Shodan, Censys) | Unexpected open ports on any domain                                |
| TLS certificates      | Cloudflare Edge Certificates         | Certificates nearing expiry or using weak ciphers                  |

### Implementation Options

#### Option A: GitHub Actions Scheduled Workflow (Recommended)

Create `.github/workflows/asm-diff.yml`:

```yaml
name: ASM Drift Detection
on:
  schedule:
    - cron: "0 8 * * *" # Daily at 08:00 UTC
  workflow_dispatch:

jobs:
  dns-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Terraform plan (drift detection)
        run: |
          cd terraform/cloudflare
          terraform init
          terraform plan -detailed-exitcode
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - name: Alert on drift
        if: failure()
        run: |
          echo "::error::DNS/Worker configuration drift detected. Review terraform plan output."
          # Send PagerDuty alert or Slack notification
```

#### Option B: Certificate Transparency Monitoring

Subscribe to CT log monitoring for all owned domains:

- [crt.sh](https://crt.sh/) — free CT log search
- Cloudflare's built-in CT monitoring (available on paid plans)
- [CertSpotter](https://sslmate.com/certspotter/) — free CT monitoring with email alerts

### Action Items

- [ ] Create `asm-diff.yml` workflow for daily Terraform drift detection
- [ ] Subscribe to CT monitoring for all production domains
- [ ] Add ASM drift alerts to PagerDuty routing
- [ ] Review ASM findings quarterly in the board cyber metrics report
