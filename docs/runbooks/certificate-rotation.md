# Runbook: TLS Certificate Rotation

**Severity:** P2 — planned maintenance
**Owner:** Platform team
**Last reviewed:** 2026-05-25

## Overview

affilite-mix uses Cloudflare as the TLS termination layer. Cloudflare manages certificate issuance and renewal automatically via Universal SSL. This runbook covers edge cases where manual intervention is needed.

## When to Use

- Cloudflare Universal SSL certificate fails to auto-renew (rare — usually DNS validation issue)
- Custom domain added and certificate not provisioning
- Certificate transparency (CT) monitoring alert fires
- Migrating a site to/from Cloudflare

## Prerequisites

- Cloudflare dashboard access (API token with Zone:SSL permissions)
- DNS management access for the domain
- Access to Terraform config (`terraform/cloudflare/`)

## Procedure

### 1. Verify Current Certificate Status

```bash
# Check certificate status via Cloudflare API
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/ssl/certificate_packs" \
  | jq '.result[] | {id, type, status, hosts, primary_certificate}'
```

### 2. Force Certificate Renewal (Universal SSL)

If auto-renewal failed:

1. **Check DNS validation:** Ensure CNAME/TXT records for `_acme-challenge` are correct
2. **Delete and re-order** the certificate pack if stuck:
   ```bash
   curl -X DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/ssl/certificate_packs/$PACK_ID"
   ```
3. Wait 5–15 minutes for Cloudflare to re-issue

### 3. Custom Domain Certificate (Advanced Certificate Manager)

For sites using Advanced Certificate Manager:

1. Navigate to Cloudflare Dashboard → SSL/TLS → Edge Certificates
2. Click "Order Advanced Certificate"
3. Select certificate type (ECDSA preferred), validity period (90 days), and SANs
4. Verify issuance status changes to "Active"

### 4. Verify Certificate in Production

```bash
# Verify the certificate is serving correctly
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer

# Check all SANs
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"
```

### 5. Update Terraform State

If certificate was manually rotated, ensure Terraform state reflects the change:

```bash
cd terraform/cloudflare
terraform plan  # Verify no drift
```

## Rollback

Cloudflare Universal SSL cannot be "rolled back" — if a new certificate has issues, contact Cloudflare support. For custom certificates, the previous certificate remains active until the new one is fully deployed.

## Monitoring

- **CT Log monitoring:** Cloudflare sends notifications for new certificates issued for your domains
- **Certificate expiry alert:** Set up monitoring for certificates expiring within 14 days
- **SSL Labs:** Periodic grade check at ssllabs.com

## Post-Rotation Checklist

- [ ] Certificate serving correctly on all custom domains
- [ ] No mixed content warnings in browser console
- [ ] HSTS header still present (`Strict-Transport-Security`)
- [ ] Terraform state matches actual configuration
- [ ] Notify team in #platform channel
