# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

Only the latest version deployed from the `main` branch receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@groupsmix.com** with (for abuse / fraud reports use **abuse@groupsmix.com**):

1. A description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact assessment
4. Any suggested remediation (optional)

### What to expect

- **Acknowledgement**: Within 48 hours of your report.
- **Triage**: We will assess severity and impact within 5 business days.
- **Resolution**: Critical and high severity issues will be patched as soon as possible, typically within 14 days. Medium and lower severity issues are addressed in the next scheduled release.
- **Disclosure**: We will coordinate disclosure timing with you. We ask that you refrain from public disclosure until a fix is available.

### Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- Cross-site scripting (XSS), CSRF, or injection vulnerabilities
- Sensitive data exposure
- Server-side request forgery (SSRF)
- Remote code execution
- Privilege escalation
- Row-Level Security (RLS) bypass in Supabase/PostgreSQL

### Out of Scope

- Denial of service (DoS/DDoS) attacks
- Social engineering
- Issues in third-party dependencies (report these to the upstream project)
- Issues requiring physical access to a user's device

### Safe Harbor (A194)

We support safe harbor for security researchers who:

1. Make a good faith effort to avoid privacy violations, destruction of data, and interruption or degradation of our services.
2. Only interact with accounts you own or with explicit permission of the account holder.
3. Do not exploit a security issue for purposes other than verification.
4. Report any vulnerability to us before disclosing it publicly.
5. Do not perform attacks against our users, social engineering, denial of service, or spam.

We will not initiate legal action against researchers who discover and report security vulnerabilities in accordance with this policy. We consider security research conducted under this policy to be authorized conduct under the Computer Fraud and Abuse Act (CFAA), the DMCA, and similar laws. We will not bring a claim against you for circumventing technology controls we have deployed to protect the applications in scope.

If legal action is initiated by a third party against you and you have complied with this security policy, we will take steps to make it known that your actions were conducted in compliance with this policy.

### Retest Commitment

Once a reported vulnerability has been remediated, we will notify the original reporter and invite them to verify the fix. We aim to close the loop within **14 days** of the initial patch deployment.

### Recognition

We maintain a security acknowledgements page for researchers who responsibly disclose valid security issues. If you would like to be credited, please indicate this in your report.

## Security Controls

This project implements the following security measures:

- **Authentication**: JWT-based auth with token binding, idle timeout, and revocation
- **Authorization**: Role-based access with `requireAdmin`, `withAuthz`, and `withAuthzDynamic` wrappers
- **Rate limiting**: Distributed rate limiting via Cloudflare KV/Durable Objects with configurable per-route fail policy. Security-critical routes (login, admin, checkout) use `failPolicy: "closed"` — they reject immediately when KV/DO is unavailable. Public routes use `failPolicy: "grace"` (default) — they fall back to per-isolate in-memory for 60s, then fail closed. See `lib/rate-limit.ts` for full policy documentation.
- **Input validation**: Server-side validation on all API routes
- **CSRF protection**: Double-submit cookie pattern (Origin-pinned, `__Host-` prefixed, `SameSite=Strict`)
- **CSP**: Content Security Policy headers enforced via middleware
- **Secret scanning**: Gitleaks in CI prevents accidental secret commits
- **Dependency scanning**: npm audit and dependency-review-action in CI
- **Static analysis**: CodeQL SAST scanning on every PR
- **Database security**: Supabase Row-Level Security (RLS) policies with tenant isolation

## Security-Related Files

- [`/.github/workflows/security.yml`](.github/workflows/security.yml) - Dependency audit, license compliance, gitleaks
- [`/.github/workflows/codeql.yml`](.github/workflows/codeql.yml) - CodeQL static analysis
- [`/lib/auth.ts`](lib/auth.ts) - Authentication implementation
- [`/lib/authz.ts`](lib/authz.ts) - Authorization helpers
- [`/lib/rate-limit.ts`](lib/rate-limit.ts) - Rate limiting
- [`/lib/csrf.ts`](lib/csrf.ts) - CSRF protection
- [`/lib/csp.ts`](lib/csp.ts) - Content Security Policy
- [`/docs/threat-model.md`](docs/threat-model.md) - Threat model documentation
- [`/docs/incident-response.md`](docs/incident-response.md) - Incident response procedures

---

## Secret Rotation Policy

> **Finding-14 / A31-A60 Remediation** — All production secrets must be rotated on the schedule below.
> Rotation is performed via `wrangler secret put <NAME>` for Worker runtime secrets and through
> the respective provider dashboard for account-level keys.

| Secret                              | Max Lifetime | Rotation Trigger                         |
| ----------------------------------- | ------------ | ---------------------------------------- |
| `STRIPE_SECRET_KEY` (live)          | **90 days**  | Quarterly or on any suspected compromise |
| `STRIPE_WEBHOOK_SECRET`             | **90 days**  | With every Stripe endpoint recreation    |
| `JWT_SECRET`                        | **90 days**  | Quarterly; immediately on breach         |
| `SUPABASE_SERVICE_ROLE_KEY`         | **180 days** | Bi-annually or on team membership change |
| `SUPABASE_JWT_SECRET`               | **180 days** | Bi-annually                              |
| `INTERNAL_API_TOKEN`                | **90 days**  | Quarterly                                |
| `CRON_SECRET` + per-trigger secrets | **90 days**  | Quarterly                                |
| `CLOUDFLARE_API_TOKEN`              | **180 days** | On team membership change                |
| `RESEND_API_KEY`                    | **180 days** | On team membership change                |
| `TURNSTILE_SECRET_KEY`              | **1 year**   | Annual or on zone change                 |

### Rotation Runbook (Worker Runtime Secrets)

Rotate a secret without a full redeploy:

```bash
# Rotate on both the main and heavy-crons workers
wrangler secret put STRIPE_SECRET_KEY --name affilite-mix
wrangler secret put STRIPE_SECRET_KEY --name affilite-mix-heavy-crons

# Confirm the health endpoint still responds 200
curl -H "Authorization: Bearer $CRON_SECRET" https://wristnerd.xyz/api/health
```

> **Warning — `JWT_SECRET` rotation**: all existing admin sessions are immediately invalidated.
> Coordinate with the on-call team before rotating during business hours.

### Stripe Key Rotation Runbook

1. Create a new **restricted key** in the Stripe Dashboard with the minimum required permissions.
2. Upload it: `wrangler secret put STRIPE_SECRET_KEY --name affilite-mix`
3. Verify at least one webhook event processes successfully in the Stripe dashboard.
4. Revoke the old key: Stripe Dashboard → API keys → Revoke.
5. Record the rotation in the team change log.

---

## Deployment Safety

- **Gradual rollout**: set repo variable `GRADUAL_ROLLOUT_ENABLED=true` to enable a 10% → 100%
  canary deploy with a health gate between stages. Requires Workers Paid plan.
- **Instant rollback**: `wrangler rollback --name affilite-mix` restores the previous version
  within seconds without a code push.
- **2-reviewer approval** is enforced for all merges to `main`.

---

## Incident Response SLOs

| Severity | Description                        | Response SLO | Escalation                  |
| -------- | ---------------------------------- | ------------ | --------------------------- |
| P0       | Data breach / RCE                  | 1 hour       | PagerDuty → on-call eng     |
| P1       | Auth bypass / privilege escalation | 4 hours      | Slack `#security-incidents` |
| P2       | Information disclosure             | 24 hours     | GitHub private advisory     |
| P3       | Best-practice gap                  | 7 days       | Standard PR                 |

In the event of a confirmed breach:

1. Rotate **all** secrets immediately (see rotation runbook above).
2. Open a private GitHub Security Advisory to track the incident.
3. Notify affected users within **72 hours** per GDPR Art. 34 if personal data was involved.
4. Conduct a post-mortem within **14 days** and publish mitigations.
