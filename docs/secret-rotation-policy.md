# Secret Rotation Policy

> A38: Secret lifecycle management — rotation cadence, break-glass procedures,
> and access-log review requirements.

## Secret Inventory

| Secret | Environment | Rotation Cadence | Last Rotated | Next Rotation |
|---|---|---|---|---|
| CLOUDFLARE_API_TOKEN | Production | 90 days | | |
| SUPABASE_SERVICE_ROLE_KEY | Production | 90 days | | |
| JWT_SECRET | Production | 180 days | | |
| CRON_SECRET | Production | 90 days | | |
| INTERNAL_API_TOKEN | Production | 90 days | | |
| STRIPE_SECRET_KEY | Production | 90 days | | |
| RESEND_API_KEY | Production | 180 days | | |
| TURNSTILE_SECRET_KEY | Production | 180 days | | |
| SOCKET_SECURITY_API_KEY | CI | 180 days | | |
| GITHUB_TOKEN (Terraform) | CI | 90 days | | |

## Rotation Procedure

### Automated Rotation (CI/CD)

Secrets marked with `[AUTO]` are rotated automatically via GitHub Actions:

```yaml
# Example: .github/workflows/rotate-secrets.yml
name: Secret Rotation
on:
  schedule:
    - cron: "0 0 1 */3 *"  # First of every 3rd month
```

### Manual Rotation Steps

1. **Generate new secret** using cryptographically secure random:
   ```bash
   openssl rand -hex 64  # For 256-bit secrets
   openssl rand -hex 32  # For 128-bit secrets
   ```

2. **Update in Cloudflare Dashboard** (or via API):
   ```bash
   echo -n "new-secret-value" | wrangler secret put SECRET_NAME
   ```

3. **Update GitHub Secrets** (if CI uses it):
   ```bash
   gh secret set SECRET_NAME --body "new-secret-value"
   ```

4. **Verify the new secret works** before revoking the old one:
   ```bash
   curl -H "Authorization: Bearer new-secret" https://<domain>/api/health
   ```

5. **Revoke the old secret** after confirming the new one works.

6. **Document the rotation** in the inventory table above.

## Break-Glass Secret Access

### When to Use Break-Glass

- Emergency incident response requiring direct secret access
- Automated rotation pipeline failure
- Security incident (suspected secret compromise)

### Break-Glass Procedure

1. **Request approval** from the security lead (via PagerDuty/Slack).
2. **Access the secret** via GitHub Actions with the `break-glass` label:
   ```bash
   gh workflow run break-glass-access.yml -f secret=SECRET_NAME -f reason="INCIDENT-123"
   ```
3. **All access is logged** — the workflow creates an audit log entry
   with the requester, approver, secret name, and timestamp.
4. **Rotate the accessed secret** within 24 hours of break-glass use.

## Access Log Review

### Monthly Review

- Review GitHub Actions secret access logs
- Review Cloudflare audit log for secret API calls
- Review `wrangler secret` usage in CI logs

### Indicators of Compromise

- Secret accessed outside of CI/CD pipeline
- Secret accessed by unknown IP address
- Multiple failed authentication attempts
- Secret used after rotation window

## Dynamic Secrets (Future)

### Vault Integration (Planned)

Migrate to HashiCorp Vault or Cloudflare Secrets Store for:
- Automatic rotation without code changes
- Dynamic short-lived credentials
- Fine-grained access policies
- Audit logging

## Compliance Mapping

| Requirement | Control | Evidence |
|---|---|---|
| SOC 2 CC6.1 | 90-day rotation | Rotation schedule + audit log |
| SOC 2 CC6.2 | Break-glass logging | break-glass-access.yml runs |
| SOC 2 CC7.2 | Secret compromise response | Incident response playbook |
| GDPR Art. 32 | Encryption key rotation | JWT_SECRET rotation log |
