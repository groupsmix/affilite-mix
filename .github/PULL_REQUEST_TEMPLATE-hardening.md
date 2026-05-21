# Security Hardening PR: Production Safety & Multi-Tenant Security

## Summary

This PR implements the highest-priority hardening fixes from the technical audit, focusing on production safety, multi-tenant security, deployment correctness, and observability readiness. The changes do not rebuild the app or change product behavior - they add automated validation, fail-fast mechanisms, and documentation.

## What Changed

### PRIORITY 0: Deployment Hard-Fail for Missing Bindings

**Problem**: Production deploys could silently continue even when required Cloudflare bindings (APP_CACHE_KV, RATE_LIMIT_KV, RATE_LIMITER_DO, CLICK_QUEUE) were missing.

**Solution**: Added explicit validation in `deploy.yml` that hard-fails if:

- RATE_LIMIT_KV binding is missing
- APP_CACHE_KV binding is missing (required for middleware/domain resolution)
- RATE_LIMITER_DO binding is missing
- CLICK_QUEUE binding is missing
- KV namespace IDs are empty placeholders

**Files Changed**:

- `.github/workflows/deploy.yml` - Added "Validate Cloudflare Worker bindings" step
- `scripts/validate-cloudflare-bindings.sh` - New validation script

---

### PRIORITY 1: Admin API Authorization Inventory & Tests

**Problem**: No automated way to verify all admin routes have proper authorization guards.

**Solution**:

- Created `scripts/check-admin-authz.sh` that validates admin routes use approved authz wrappers
- Documented the authorization model for all admin routes in `docs/authorization-inventory.ts`
- Added CI step for DAL usage audit

**Authorization Models Documented**:

- `requireAdmin`: Validates admin session, active site cookie, and membership
- `requireSuperAdmin`: Validates super_admin role
- `withAuthz`: Validates session + permission for current site (site-scoped admin)
- `withAuthzDynamic`: Validates session + permission for dynamic routes

**Files Added**:

- `scripts/check-admin-authz.sh` - Automated authz validation
- `docs/authorization-inventory.ts` - Route authorization documentation

---

### PRIORITY 2: CORS Security Tests

**Problem**: No automated tests verifying CORS handling of hostile host/origin combinations.

**Solution**:

- Added `__tests__/cors-security.test.ts` with tests for:
  - Known valid tenant domains
  - Configured app/admin domains
  - Unknown domains (should be rejected)
  - Hostile Origin headers (should be rejected)
  - Mismatched Host/Origin combinations
  - Localhost/dev behavior

**Files Added**:

- `__tests__/cors-security.test.ts` - CORS security test suite

---

### PRIORITY 3: Feature-Aware Environment Validation

**Problem**: Production could silently run with enabled features missing their required secrets.

**Solution**:

- Extended `lib/server-env.ts` with feature-aware validation:
  - Newsletter enabled → RESEND_API_KEY required
  - Turnstile enabled → TURNSTILE_SECRET_KEY required
  - Stripe enabled → STRIPE_WEBHOOK_SECRET required
  - Production → SENTRY_DSN required for observability
- Added observability validation function for OTEL configuration

**Files Changed**:

- `lib/server-env.ts` - Extended FEATURE_CONDITIONAL_ENV and added validation functions

---

### PRIORITY 4: R2 Upload Safety Validation

**Problem**: CI had no validation for R2 bucket isolation (private vs public).

**Solution**:

- Added CI step to warn if R2_BUCKET_NAME is used without distinct PRIVATE/PUBLIC buckets
- Runtime validation already exists in `lib/r2.ts` (F-09) - this adds CI validation

**Files Changed**:

- `.github/workflows/ci.yml` - Added R2 bucket isolation validation step

---

### PRIORITY 5: Production Readiness Documentation

**Problem**: No concrete checklist matching actual code/workflows for production deployment.

**Solution**:

- Created `docs/ops/production-readiness.md` with:
  - Required Cloudflare bindings with setup commands
  - Required GitHub secrets (build-time and runtime)
  - Required Supabase settings
  - Required alerts configuration
  - Backup/restore expectations
  - Deploy/rollback process
  - Smoke tests after deploy
  - Manual verification checklist
  - Troubleshooting guide

**Files Added**:

- `docs/ops/production-readiness.md` - Comprehensive production readiness guide

---

## Risks Reduced

| Priority | Risk                                                  | Mitigation                                      |
| -------- | ----------------------------------------------------- | ----------------------------------------------- |
| P0       | Deploy without required bindings crashes Worker       | CI hard-fails if bindings missing               |
| P0       | Deploy without required secrets causes runtime errors | CI validates all required secrets before deploy |
| P1       | Cross-tenant data exposure via unguarded admin routes | Automated CI check + documentation              |
| P2       | CORS misconfiguration allows hostile origins          | CORS security tests                             |
| P3       | Feature enabled without required provider secrets     | Feature-aware env validation                    |
| P4       | R2 uploads publicly accessible before validation      | CI + runtime validation for bucket isolation    |
| P5       | Production issues due to missing configuration        | Comprehensive documentation                     |

---

## How to Test Locally

### 1. Validate Cloudflare Bindings

```bash
bash scripts/validate-cloudflare-bindings.sh
```

### 2. Validate Admin Route Authorization

```bash
bash scripts/check-admin-authz.sh
```

### 3. Run CORS Security Tests

```bash
npm test -- --testPathPattern="cors-security"
```

### 4. Validate Server Environment

```bash
# Set up test environment
export NODE_ENV=production
export NEWSLETTER_ENABLED=true
# Oops, missing RESEND_API_KEY - should fail

# Now set the key
export RESEND_API_KEY=test-key
# Should pass
```

---

## What Still Needs Manual Verification

These items cannot be verified from the repo alone:

### Cloudflare Dashboard

- [ ] Workers & Pages → affilite-mix → Triggers → Custom Domains configured
- [ ] Workers & Pages → affilite-mix → Settings → Environment Variables set
- [ ] KV namespaces created with correct IDs in wrangler.jsonc
- [ ] Queues `click-tracking` and `click-tracking-dlq` created

### Supabase Dashboard

- [ ] Project Settings → Database → Connection pooling → Session pooler URL copied
- [ ] Row Level Security enabled on all tables
- [ ] No unexpected public schema grants

### GitHub Settings

- [ ] All required secrets configured (see docs/ops/production-readiness.md)
- [ ] Branch protection rules require all checks

---

## CI Changes Summary

| Workflow   | Change                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| deploy.yml | Added "Validate Cloudflare Worker bindings" step before secrets validation |
| ci.yml     | Added CORS security tests step                                             |
| ci.yml     | Added R2 bucket isolation validation step                                  |
| ci.yml     | Enhanced admin route DAL usage audit step                                  |

---

## Files in This PR

| File                                      | Action   | Description                                           |
| ----------------------------------------- | -------- | ----------------------------------------------------- |
| `.github/workflows/deploy.yml`            | Modified | Added binding validation step                         |
| `.github/workflows/ci.yml`                | Modified | Added CORS tests, R2 validation, enhanced authz audit |
| `lib/server-env.ts`                       | Modified | Added feature-aware env validation                    |
| `scripts/validate-cloudflare-bindings.sh` | Added    | Cloudflare binding validation script                  |
| `scripts/check-admin-authz.sh`            | Added    | Admin route authz audit script                        |
| `__tests__/cors-security.test.ts`         | Added    | CORS security test suite                              |
| `docs/authorization-inventory.ts`         | Added    | Admin route authorization documentation               |
| `docs/ops/production-readiness.md`        | Added    | Production readiness checklist                        |

---

## Review Checklist for Maintainers

- [ ] All new scripts are executable (`chmod +x`)
- [ ] CI workflow changes don't break existing checks
- [ ] CORS security tests have correct assertions
- [ ] Feature-aware env validation handles all edge cases
- [ ] Documentation matches actual code/workflows
- [ ] No hardcoded secrets or tokens
- [ ] All comments explain "why" not just "what"

---

## Notes for Release

- **No breaking changes**: This PR only adds validation and documentation
- **Backward compatible**: Existing functionality unchanged
- **CI additive**: New checks are additive, existing checks unchanged
- **Rollback path**: If issues arise, revert this PR and deploy previous version
