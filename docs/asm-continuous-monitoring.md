# Continuous Attack Surface Management (ASM)

> **A206/A213 Remediation** — Scheduled ASM diff and Dashboard-routed domain tracking.
> **Last updated:** 2026-05-29

---

## 1. Problem

- Two domains (`cryptoranked.xyz`, `compareai.site`) are routed via the Cloudflare Dashboard, **not** managed by Terraform IaC (`terraform/cloudflare/dns.tf`). This creates configuration drift risk (A206).
- No automated daily diff alerts for new ports, subdomains, or certificates appearing on the attack surface (A213).

---

## 2. Dashboard-Routed Domains (A206)

The following domains are configured outside Terraform (`terraform/cloudflare/dns.tf`).
**State verified against the live Cloudflare account on 2026-06-10** — the original
"Dashboard Worker Route" classification was inaccurate for both:

| Domain             | Actual State (2026-06-10)                                                                       | Risk                                   | Action                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cryptoranked.xyz` | Workers **custom domain** already exists (service `affilite-mix`, env `production`), dashboard-created | Low — config drift, no audit trail     | `terraform import` into `external_zone_worker_domains` (no live change needed)                                     |
| `compareai.site`   | **No worker binding at all.** Stale apex DNS record points to a dead origin → site serves **522** | High — production outage on this host  | Delete stale apex A/CNAME record, then create the Workers custom domain (apply `external_zone_worker_domains`) |

### Migration Plan

> **Updated 2026-06-10:** the original plan (adding these hostnames to
> `worker_custom_domains` and importing into
> `cloudflare_workers_custom_domain.worker_domains[...]`) was incorrect —
> that resource binds every hostname to `var.zone_id` (the `wristnerd.xyz`
> zone), while `cryptoranked.xyz` and `compareai.site` are separate
> Cloudflare zones. A dedicated resource,
> `cloudflare_workers_custom_domain.external_zone_worker_domains`
> (hostname → zone_id map), now exists in `terraform/cloudflare/dns.tf`.

1. Use `scripts/cf-security-snapshot.sh` to dump current custom domain and DNS configuration.
2. Set the hostname → zone_id map in `dns.auto.tfvars`:
   ```hcl
   external_zone_worker_domains = {
     "cryptoranked.xyz" = "<cryptoranked.xyz zone id>"
     "compareai.site"   = "<compareai.site zone id>"
   }
   ```
3. If a custom domain already exists for a hostname, import it so Terraform adopts rather than recreates it:
   ```bash
   terraform import 'cloudflare_workers_custom_domain.external_zone_worker_domains["cryptoranked.xyz"]' \
     "${var.cloudflare_account_id}/<custom-domain-id>"
   terraform import 'cloudflare_workers_custom_domain.external_zone_worker_domains["compareai.site"]' \
     "${var.cloudflare_account_id}/<custom-domain-id>"
   ```
4. If the dashboard config is a Worker *route* (not a custom domain), `terraform apply` to create the custom domain, verify the hostname still serves, then delete the dashboard route.
5. Run `terraform plan` to verify no unexpected changes. Done when the plan is clean and both hostnames still serve traffic.

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
