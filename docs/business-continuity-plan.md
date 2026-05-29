# Business Continuity Plan (BCP)

> **A192 Remediation** — Standalone BCP for critical business functions during vendor outages.
> **Last updated:** 2026-05-29

---

## 1. Purpose

This plan ensures that critical business functions (payments, support, deployments, and content delivery) can continue or be restored within acceptable timeframes when one or more Tier 1 vendors (Cloudflare, Supabase, Stripe, GitHub) experience an extended outage (> 4 hours).

---

## 2. Critical Business Functions

| Function                        | Vendor Dependency             | RTO      | RPO              | Priority |
| ------------------------------- | ----------------------------- | -------- | ---------------- | -------- |
| Content delivery (public sites) | Cloudflare Workers + Supabase | 30 min   | 5 min            | P0       |
| Payment processing              | Stripe                        | 4 hours  | 0 (no data loss) | P0       |
| Admin dashboard                 | Cloudflare Workers + Supabase | 2 hours  | 5 min            | P1       |
| Email delivery (newsletters)    | Resend                        | 24 hours | N/A              | P2       |
| CI/CD deployments               | GitHub Actions                | 24 hours | N/A              | P2       |
| Error monitoring                | Sentry                        | 48 hours | N/A              | P3       |

---

## 3. Scenario Playbooks

### Scenario A: Cloudflare Full Outage (> 4 hours)

**Impact:** All sites unreachable, Workers not executing, KV/R2 unavailable.

**Response:**

1. Verify outage via [Cloudflare Status](https://www.cloudflarestatus.com/) and independent monitoring.
2. Communicate to users via status page / social media (hosted outside Cloudflare).
3. If outage exceeds 4 hours:
   - DNS failover: Update DNS registrar to point directly to a fallback static page (pre-provisioned on a non-Cloudflare host).
   - Payments: Stripe webhooks will queue; no action needed until Cloudflare recovers.
   - Admin actions: Pause until Workers recover; no direct DB access except for break-glass.
4. Post-recovery: Verify all cron jobs ran; replay any missed scheduled publishes.

**Fallback assets:**

- Static maintenance page: Hosted on GitHub Pages (`groupsmix.github.io/status`).
- DNS registrar access: Documented in `docs/vendor-dpas.md` (not dependent on Cloudflare).

### Scenario B: Supabase Full Outage (> 4 hours)

**Impact:** Database unavailable, auth broken, content reads fail.

**Response:**

1. Verify via [Supabase Status](https://status.supabase.com/).
2. Worker health endpoint will return 503; Sentry alerts will fire.
3. If outage exceeds 4 hours:
   - Enable static cache mode: Workers serve stale content from KV cache (if KV is available).
   - Payments: Stripe webhooks will fail to process; configure Stripe to retry (automatic).
   - Auth: Admin logins will fail; accept downtime for admin functions.
4. Post-recovery: Check PITR status; verify no data loss; replay failed webhook events.

### Scenario C: Stripe Outage (> 4 hours)

**Impact:** Payments cannot process, webhooks fail.

**Response:**

1. Verify via [Stripe Status](https://status.stripe.com/).
2. Affiliate click tracking continues normally (independent of Stripe).
3. Queue payment-related user actions with a "payment processing delayed" message.
4. Post-recovery: Stripe replays queued webhooks automatically; verify all processed.

### Scenario D: GitHub Outage (> 24 hours)

**Impact:** Cannot deploy new code, CI/CD halted, no PR reviews.

**Response:**

1. Verify via [GitHub Status](https://www.githubstatus.com/).
2. Current production deployment remains running (no impact to live sites).
3. If critical hotfix needed:
   - Clone from local mirrors.
   - Deploy directly via `wrangler deploy` from a trusted developer laptop (break-glass, requires 2-person custody per `terraform/github/branch-protection.tf`).
4. Post-recovery: Push any emergency commits; open retroactive PR for review.

---

## 4. Communication Plan

| Audience    | Channel                                     | Responsible             | Timing                            |
| ----------- | ------------------------------------------- | ----------------------- | --------------------------------- |
| End users   | Status page, social media                   | Marketing / on-call eng | Within 30 min of confirmed outage |
| Admin users | Email, in-app banner                        | On-call engineer        | Within 1 hour                     |
| Team        | Slack `#incidents`                          | Incident commander      | Immediately                       |
| Regulators  | Per `docs/breach-notification-templates.md` | Security lead + legal   | Only if data breach component     |

---

## 5. Testing

- BCP scenarios are tested as part of the quarterly tabletop exercises (`docs/tabletop-exercises.md`).
- DR drill workflow (`.github/workflows/dr-drill.yml`) tests Supabase failover specifically.
- Static maintenance page availability is verified monthly.

---

## 6. Review

This plan is reviewed and updated:

- Quarterly (aligned with tabletop exercises)
- After any vendor outage affecting production
- After any change to Tier 1 vendor relationships
