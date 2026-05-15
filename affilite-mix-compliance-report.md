# Compliance & Governance Audit — `groupsmix/affilite-mix`

**Repo:** https://github.com/groupsmix/affilite-mix
**Commit reviewed:** `main` HEAD as of 2026-04-30
**Scope:** Mapping the codebase against the user's checklist items A163–A170 (financial controls) and A197–A204 (legal / IP / ESG / governance).
**Author:** Devin (automated source review).
**Caveat:** This is a code & documentation review only. It is **not** legal advice, **not** an auditor's opinion, and **not** a SOX 404 attestation. Items requiring counsel, an external auditor, or business-side input are flagged "needs counsel" / "needs business input".

---

## 0. App profile (so the rest of the report makes sense)

`affilite-mix` is a multi-tenant **affiliate-content / newsletter / membership** platform:

- **Tech**: Next.js 15 (App Router), Supabase (Postgres + RLS), Cloudflare Workers (via `@opennextjs/cloudflare`), Cloudflare KV/R2/Queues, Sentry, Stripe.
- **Money flow**: Stripe is the **system of record** for subscriptions. The app stores a `memberships` mirror and a `stripe_events` idempotency log. The product itself does **not** invoice, price, tax, or settle — it consumes Stripe webhooks (`checkout.session.completed`, `invoice.paid`, `customer.subscription.{updated,deleted}`) and updates membership status.
- **Revenue model**: subscription tiers (insider / pro), affiliate-link commissions (tracked but the actual settlement happens at the affiliate network), and ad placements (AdSense / Carbon / EthicalAds / custom).
- **There is no invoice ledger, no AR/AP, no GL, no PO system, no vendor-payment workflow** in this repo. Several A163–A170 items therefore map to "not applicable in code — Stripe + finance system handle it" rather than to gaps. Those are called out where relevant.

---

## A163 — ASC 606 / IFRS 15 revenue recognition

**Verdict: NOT IMPLEMENTED IN APP. Relies on Stripe + downstream finance system.**

| Element | Status | Evidence |
|---|---|---|
| Identify contract | Stripe Checkout session + `memberships` row | `app/api/membership/checkout/route.ts`, `lib/dal/memberships.ts` |
| Performance obligations | Single PO per subscription (tier-based access) — implicit | No PO table; tier inferred from `STRIPE_PRICE_ID_*` env vars |
| Transaction price | Lives in Stripe Price IDs; not stored in app | `lib/stripe-event-processor.ts` reads from `stripe.subscriptions.retrieve` |
| Allocate | Single-obligation contracts → trivial | n/a |
| Recognize | **Not done in app.** No deferred-revenue table, no period-based recognition, no journal entries | n/a |
| Refunds | **Not handled.** See A169 below | `charge.refunded` event is **not** in the webhook handler |
| Partial cancels | `customer.subscription.deleted` flips `status='cancelled'`; period-end retained but no proration journal | `supabase/migrations/00070_atomic_stripe_event_apply.sql` |
| Mid-cycle plan change | Handled at Stripe; mirrored via `customer.subscription.updated` → `update_status` only. Tier is **not re-read** on update, so a Stripe-side tier change is invisible in the app | `lib/stripe-event-processor.ts` (`customer.subscription.updated` branch) |
| Taxes | Not in app — see A164 | n/a |
| Currency | Single-currency design. `products.price_amount NUMERIC(12,2)` + `price_currency` column exists, but no FX, no rounding policy, no presentation-currency conversion | `supabase/migrations/00089_standardize_money_columns.sql` |

### Gaps & recommendations

1. **Mid-cycle tier change blind spot.** `customer.subscription.updated` only updates `status`. If a customer upgrades insider→pro in Stripe, `memberships.tier` will not change. **Fix**: extend the `update_status` op or add an `update_tier` op that reads the price ID off the subscription.
2. **No reconciliation of recognized revenue between Stripe and the app's `memberships` mirror.** A daily Stripe→DB reconciliation job is missing (see A166).
3. **Revenue recognition itself is out of scope for this codebase.** That belongs in your finance/ERP system. If you need ASC 606 evidence: document explicitly that Stripe is the system of record, the app is a non-financial mirror, and recognized revenue is computed in [your accounting system]. Then ASC 606 controls live there, not here.

---

## A164 — Tax (Avalara/TaxJar/VAT MOSS/reverse charge/nexus/GST/exemption certs/sequential invoice numbers)

**Verdict: NOT IMPLEMENTED. Stripe Tax is not enabled in code.**

| Item | Status |
|---|---|
| Avalara / TaxJar integration | None |
| Stripe Tax | Not configured in checkout session creation (`app/api/membership/checkout/route.ts` does not pass `automatic_tax: { enabled: true }`) |
| Per-jurisdiction rate | None |
| VAT MOSS / OSS | None |
| Reverse charge | None |
| US economic nexus tracking | None |
| GST | None |
| Exemption certificates | None |
| Sequential invoice numbers | Stripe-managed (Stripe issues `INV-…` numbers if invoices are emitted; app does not generate any) |

### Gaps & recommendations

1. **If you sell B2C across borders, you have unaddressed VAT/GST exposure.** Cheapest fix: enable Stripe Tax (`automatic_tax: { enabled: true }`) in `app/api/membership/checkout/route.ts`. Verify it covers all jurisdictions you sell into; for US states with economic nexus you'll likely need TaxJar/Avalara because Stripe Tax US coverage has gaps.
2. **No customer tax-ID capture.** Stripe Checkout supports `tax_id_collection: { enabled: true }` — required for EU B2B reverse-charge.
3. **No exemption-cert workflow.** Out of scope for this codebase; document where exemption certs live (likely your finance team's Avalara/TaxJar tenant).
4. **Action item — needs counsel + finance**: produce a per-jurisdiction nexus map with revenue thresholds, then decide Stripe-Tax-only vs. Avalara/TaxJar.

---

## A165 — Segregation of Duties (SOD) for users with financial impact

**Verdict: PARTIAL. RBAC is solid, but no explicit SOD matrix is enforced.**

What exists:

- Fine-grained RBAC: every admin route is gated by `withAuthz(feature, action, handler)` against the **server-derived** active site cookie (`lib/authz.ts`). The full route-by-route matrix is in `docs/admin-route-authorization-matrix.md`.
- Two-person rule for code: `BP-3` branch protection requires PR review + CODEOWNERS approval (`docs/github-branch-protection.md`, `terraform/github/branch-protection.tf`).
- Audit log on admin mutations (`lib/audit-log.ts`).

What's missing for SOX-style SOD:

| Control | Status |
|---|---|
| Documented list of forbidden role combinations | **Missing.** No code or doc enumerates "user with `members:create` MUST NOT also have `payouts:approve`" because there is no payouts/vendor-create flow in the app at all. |
| Vendor-create vs. invoice-approve separation | **N/A** — there is no AP / vendor-payment workflow in the repo. |
| Production-push approval separated from code-author | **Yes.** GitHub branch protection + `.github/workflows/deploy.yml` requires merged PR. |
| Fund-release approval | **N/A** — no funds released by the app; commissions to affiliates are computed/tracked but settlement is not in this repo. |
| SOD compensating controls when one person holds combined privileges (small team) | **Not documented.** |

### Recommendations

1. Even though most SOD-relevant flows aren't in this repo, you should **explicitly** document that fact in `docs/soc2-controls-mapping.md` so an auditor can stop looking for it (currently they have to infer it).
2. For the workflows that *are* in code, write down the SOD matrix. Examples for this app:
   - `super_admin` should not be the only role allowed to delete `audit_log` rows. **Already handled** by `00084_lock_migrations_applied_rls.sql` and the immutable-by-RLS posture, but call it out.
   - Whoever can publish AI drafts (`ai_drafts.status='approved'`) should not be the same person who *generated* them. The current code does not enforce this — `lib/dal/ai-drafts.ts` and the approval endpoint don't check `actor != generator`.
3. Add a CI check (you already have `scripts/check-admin-authz.sh`) that asserts no single role has a forbidden combination of permissions. Easy win for SOX evidence.

---

## A166 — Close pipeline (source-of-truth ledger, idempotent ingestion, immutable journal, daily reconciliation, variance alerts, signed close certs)

**Verdict: PARTIAL — and most of this isn't supposed to live in this repo.**

| Item | Status | Evidence |
|---|---|---|
| Source-of-truth ledger | **Not in app.** Stripe is SoT. | n/a |
| Idempotent ingestion | **Yes (excellent).** `apply_stripe_membership_event` plpgsql RPC inserts into `stripe_events` and applies the side effect in **one transaction** with `ON CONFLICT DO NOTHING` on `stripe_event_id`. | `supabase/migrations/00070_atomic_stripe_event_apply.sql` |
| Immutable journal | **Partial.** `audit_log` is service-role-only with deny policies for everyone else (`00067_harden_tenant_isolation_rls.sql`); but no append-only enforcement at the DB level (no trigger blocking UPDATE/DELETE; relies on RLS + lack of admin-side mutation endpoint). | `lib/audit-log.ts`, `00084_lock_migrations_applied_rls.sql` |
| Daily reconciliation Stripe ↔ DB | **MISSING.** No cron job reconciles Stripe's view of subscriptions against the app's `memberships` table. | n/a |
| Variance alerts | **Missing.** | n/a |
| Signed close certs | **N/A in repo** (finance artifact). | n/a |

### Recommendations

1. **Add a daily Stripe↔Supabase reconciliation cron.** `app/api/cron/stripe-sync/route.ts` already exists and is the right home — verify it covers (a) every active subscription in Stripe has a matching `memberships` row, (b) every `memberships.status='active'` row has an active Stripe subscription, (c) period boundaries match. Emit Sentry events on variance.
2. **Make `audit_log` truly append-only** by adding a Postgres trigger that raises on UPDATE or DELETE for non-`service_role` callers, and removing the retention purge from `purge_retention()` (it currently `DELETE`s rows older than 365 days — see `00077_purge_retention_function.sql:16`). For SOC2 / SOX you generally want immutable evidence; if you must purge for GDPR, archive to R2 first (the doc claims this happens but I don't see code that performs the archive write before the delete).
3. **Add a "close cert" stub** in `docs/runbooks/` describing what a finance lead signs off on at month-end and where the artifact lives. Not code, but lets you tick the box.

---

## A167 — "Money tables" in prod: every UPDATE/DELETE → audit table; no raw SQL writes outside approved migrations

**Verdict: STRONG — with two real gaps.**

What's good:

- Stripe-driven mutations on `memberships` go through the atomic plpgsql RPC (`00070_atomic_stripe_event_apply.sql`). No code path writes to `memberships` outside this RPC and the DAL.
- Service-role allowlist (`lib/security/service-role-allowlist.ts`) restricts who can mint a service-role client.
- Migrations are gated by CI (`scripts/check-migrations.sh`, `.github/workflows/deploy.yml` staging dry-run).
- `audit_log` is queue-backed (`AUDIT_QUEUE`) with R2 NDJSON dead-letter (`AUDIT_DLQ_BUCKET`).

Gaps:

1. **Stripe-driven membership writes do not land in `audit_log`.** `lib/stripe-event-processor.ts` calls `applyStripeEventAtomic` and then `logger.info` — but never `recordAuditEvent`. So an external auditor will see "membership row mutated; who mutated it?" answered only in `stripe_events` and Sentry, not in your immutable audit table. **Fix**: have the plpgsql RPC also insert an `audit_log` row inside the same transaction with `actor='stripe-webhook'` and `details={ event_id, event_type }`.
2. **`commissions` table mutations are not gated through an audit-logged DAL.** Search for `recordAuditEvent` calls referencing `commissions` returns nothing. Commissions are **money** — every UPDATE should hit the audit log. Suggest: wrap the `lib/dal/commissions.ts` writers in an audit decorator, similar to how admin routes wrap with `withAuthz`.
3. **Audit retention contradicts immutability.** `purge_retention()` deletes audit rows older than 365 days. RoPA claims hot+cold tiers (365d hot, 7y R2 cold). I do not see code that copies to R2 before deletion — only the DLQ bucket for in-flight failures. Verify the archive step exists (likely missing).

---

## A168 — Pricing/discount stacking, expiration TZ, price-floor, currency rounding, dispute trail

**Verdict: MOSTLY N/A — only a thin pricing surface in code.**

| Item | Status |
|---|---|
| Discount stacking | **No discount engine.** App relies on Stripe Coupons / Promotion Codes. Not configured server-side. |
| Expiration TZ | Stripe-managed |
| Price-floor | **No app-level enforcement.** `chk_products_price_amount_nonneg CHECK (price_amount >= 0)` only enforces non-negative. No floor per market. |
| Currency rounding (banker's vs half-up) | Not addressed in app code. `NUMERIC(12,2)` storage; arithmetic is delegated to Stripe. |
| Dispute trail | See A169. |

### Recommendations

1. If you ever introduce app-level coupons (e.g., affiliate-driven promo codes), build the stacking rules into a single `lib/pricing/` module with an explicit precedence list and unit tests for "max stacking" cases. Don't sprinkle discount logic across DAL files.
2. Document in `docs/CLOUDFLARE.md` (or a new `docs/pricing-policy.md`) that all rounding is delegated to Stripe and that the app **must not** independently compute customer-charged amounts. Then have a unit test asserting no `Math.round` / `toFixed` calls exist on price arithmetic in `lib/dal/`.

---

## A169 — Refund / dispute / chargeback handling

**Verdict: SIGNIFICANT GAP. The webhook handler does not process refunds, disputes, or chargebacks at all.**

`lib/stripe-event-processor.ts` only handles four event types:

```
checkout.session.completed
invoice.paid
customer.subscription.updated
customer.subscription.deleted
```

These are NOT handled (verified via grep):

| Event | Why it matters |
|---|---|
| `charge.refunded` | A refund flips revenue. Without this, your `memberships` mirror keeps showing "active" after a refund-driven cancel; reconciliation only catches it on next subscription event. |
| `charge.dispute.created` | A dispute should freeze membership / flag for review. Currently silent. |
| `charge.dispute.closed` | Lost-dispute = revenue reversal. Silent. |
| `invoice.payment_failed` | First sign of a churning member. Status should flip to `past_due`; currently doesn't. |
| `customer.subscription.paused` | Pause/resume flows aren't handled. |

The doc claims `past_due` is a valid status (`MembershipRow.status` union), but no code path writes it.

Idempotency keys & double-refund prevention: **not applicable** because no refund code exists. Stripe's own idempotency handles double-API-call prevention; you have nothing in the app to double-process.

Period locks: **not implemented.** A refund issued after a period close would not be flagged.

Cross-border fees: not in app (Stripe handles).

### Recommendations (concrete)

1. **Add `charge.refunded`, `charge.dispute.created/.closed`, `invoice.payment_failed` to the webhook handler** in `lib/stripe-event-processor.ts`, with corresponding `op` values in `apply_stripe_membership_event`. Each should write to `audit_log` (see A167 fix #1).
2. **Add a "period lock" flag** on `memberships` or a separate table so you can reject post-close mutations from cron jobs (not from Stripe — Stripe wins always — but block manual admin overrides on locked periods).
3. **Reconciliation safety net**: the daily Stripe→DB reconciliation (A166) will catch refund drift even if you don't add the webhook handlers, but with a 24h lag. Webhook handling is the right primary control.

---

## A170 — ITGC / SOX 404 evidence map

**Verdict: STRONG documentation; weak on period-of-reliance dates.**

What exists (this is genuinely well done):

- `docs/soc2-controls-mapping.md` maps CC6.1, CC6.6, CC6.7, CC7.2, CC8.1 to code artifacts.
- `docs/compliance-evidence.md` is a "where does the evidence live" index.
- `docs/access-recertification.md` has a quarterly checklist with system-by-system roster export instructions (GitHub, Cloudflare, Supabase, Sentry, Stripe, Admin Dashboard).
- `docs/threat-model.md` documents accepted risks (rate-limiter fail-open behavior, service-role bypass of RLS, vendor lock-in).
- Branch protection, CODEOWNERS, gitleaks, dependabot, semgrep, codeql, SBOM workflows are all wired in `.github/workflows/`.
- `docs/dr-drill-checklist.md` + `.github/workflows/dr-drill.yml` covers DR.

Gaps:

1. **No "period of reliance" dates.** A SOX 404 evidence map needs explicit "this control was effective from YYYY-MM-DD to YYYY-MM-DD". Add a header to `docs/compliance-evidence.md` per quarter.
2. **No control-design walkthrough document.** Auditors usually want a narrative for each significant flow (e.g., revenue, access, change). You have the pieces; consolidating them into one walkthrough would save audit time.
3. **Computer ops:** logging/alerting are documented; backups/DR are documented; **incident-management cadence** (post-mortem due dates, severity SLAs, escalation matrix) is in `docs/incident-response.md` but not formalized as a control with quarterly evidence.

---

# Part 2 — A197–A204 (legal / IP / governance)

> This whole section is mostly outside the codebase. Where the repo can host artifacts, it does (NOTICE.md, RoPA, vendor DPAs). Most of the items below need legal counsel + corporate governance to actually close.

## A197 — IP hygiene

**Verdict: PARTIAL.**

| Item | Status |
|---|---|
| `LICENSE` | "Source-Available — All Rights Reserved (No License Granted)" — Copyright (c) 2025 Erosqa / groupsmix contributors. **OK.** |
| `NOTICE.md` | Strong. Lists shadcn/ui, Qualiora/shadboard, arhamkhnz/next-shadcn-admin-dashboard, openstatusHQ/data-table-filters, vercel/platforms with upstream + license + adaptation notes. |
| OSS dependency review | `npm audit` runs in CI; SBOM workflow exists; license-exclusions list at `.github/license-exclusions.txt`. **Good.** |
| Contributor PIIA | **Not in repo.** Needs HR / legal — invention assignment + IP transfer agreements should be on file with HR for every contributor. |
| Employee invention assignment | **Not in repo.** Same as above. |
| Patent landscape monitoring | **Not in scope for repo.** |
| Trademark register | **Not in repo.** |

### Recommendations

1. Add a `CLA.md` or DCO requirement for external contributors — `CONTRIBUTING.md` says "internal collaborators only" but doesn't reference signed agreements.
2. Maintain an internal IP register (IP register template) outside the repo. Reference it from `docs/compliance-evidence.md` for the M&A pack.

## A198 — Export controls (ECCN, BIS 740.17, sanctions, deemed export, SaaS vs on-prem)

**Verdict: NOT ADDRESSED.**

The app uses cryptography (`bcryptjs`, `jose` JWT, Web Crypto) which is dual-use under EAR Category 5 Part 2. Most SaaS apps qualify for License Exception ENC under §740.17 with an annual self-classification report and an encryption notification at first export.

| Item | Status |
|---|---|
| ECCN classification documented | **Missing.** |
| BIS 740.17 encryption notification | **Missing.** |
| Sanctioned-country block on signup / download | **Missing.** No OFAC IP blocking in middleware (`middleware.ts`). |
| Deemed export | Not in scope for repo. |
| SaaS vs on-prem | SaaS only; ENC §740.17(b)(1) — likely eligible but requires the annual report. |

### Recommendations

1. **Have counsel produce the ECCN classification matrix.** Likely outcomes: 5D002.c.1 (mass-market software using crypto) → ENC eligible. Encryption components reused from third-party (Cloudflare TLS, Stripe TLS, Postgres TLS) are typically out-of-scope for the registrant.
2. **Add a sanctioned-country block** in `middleware.ts` keyed on Cloudflare's `cf.country` header (already available at the edge). Block at minimum: Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk regions, plus any specific entities on the SDN list relevant to your customer base. Add a public allowlist exception process.
3. **Annual encryption registration with BIS** — needs counsel; not a code task.

## A199 — Marketing claims (FTC, EU UCPD, "AI-powered", comparative)

**Verdict: PARTIAL.**

| Item | Status |
|---|---|
| Affiliate disclosure | **Implemented.** `app/(public)/affiliate-disclosure/page.tsx` per-site, plus per-site config flag. Good FTC posture. |
| "AI-powered" claims defensibility | **Documented**: `docs/ai-governance.md` enumerates models, guardrails, prompt sanitization, approval gates. Sufficient if you publicly claim "AI-assisted" rather than "fully AI-generated". |
| FTC endorsement guides | Affiliate disclosure handles this, but if you ever onboard influencers, you'll need a separate creator agreement + disclosure check. |
| EU UCPD (Unfair Commercial Practices Directive) | Not addressed. |
| Comparative claims with sourcing | Not addressed (no comparison tables generate "X is better than Y" claims; if AI drafts do, sourcing should be required). |
| Substantiation file | **Missing.** No central place where evidence for marketing claims lives. |

### Recommendations

1. Add a `docs/marketing-claims.md` "substantiation file" that, for every public-facing factual claim, points to the source. AI drafts should be required to cite — there's already an approval gate; extend it to require sources.
2. Have legal review the privacy policy and `affiliate-disclosure` copy for EU UCPD compliance (specifically: "limited time offer" claims, "save X%" claims, scarcity cues).

## A200 — Children's data (COPPA / Age-Appropriate Design Code / GDPR-K)

**Verdict: NOT ADDRESSED. Likely OK because the app isn't directed at children, but the privacy posture should explicitly say so.**

| Item | Status |
|---|---|
| Age gate at signup | **None.** |
| Parental consent flow | **None.** |
| No behavioral ads to under-18 | Not enforced — app uses AdSense/Carbon/EthicalAds without age signals. |
| Privacy policy children's-data section | Not visible in `app/(public)/privacy/page.tsx` review. |

### Recommendations

1. If you don't target under-13 (US) / under-13–17 (UK Age-Appropriate Design Code), state that explicitly in the privacy policy and in your DPAs.
2. If any tenant site does target children, COPPA verifiable parental consent is non-trivial — generally implemented via a third party (e.g., PRIVO, Kids Web Services). Out of scope for this codebase.
3. **Action**: counsel + privacy policy update.

## A201 — Accessibility (ADA III, EAA 2025, AODA, JIS) and WCAG 2.2 AA

**Verdict: GOOD foundation, slightly behind on the WCAG 2.2 / EAA 2025 front.**

What exists:

- `e2e/a11y.spec.ts` runs axe-core against homepage, search, contact, privacy, admin login.
- `e2e/a11y-keyboard.spec.ts` keyboard-only checks.
- `e2e/accessibility.spec.ts` additional coverage.
- RTL test suite for Arabic locale (`ar-SA`).
- `@axe-core/playwright` tagged with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- Lighthouse CI configured (`lighthouserc.cjs`).

Gaps:

| Item | Status |
|---|---|
| WCAG **2.2** AA coverage | Currently only 2.1 AA tags. WCAG 2.2 added 9 success criteria (focus appearance, dragging movements, target size, etc.) — not asserted. |
| Public conformance statement | **Missing.** No `app/(public)/accessibility/page.tsx`. |
| Roadmap | Missing. |
| Complaints log | Missing. |
| EAA 2025 (28 June 2025 deadline) | **Action required if you sell into the EU.** Need conformance statement + remediation roadmap. |
| AODA (Ontario, Canada) | Same posture as EAA — likely fine if WCAG 2.0 AA is met, but no statement. |
| Japan JIS X 8341-3 | Not addressed. |

### Recommendations

1. Add `wcag22aa` to the axe-core `withTags()` call in `e2e/a11y.spec.ts`.
2. Add a public **Accessibility Statement** page (`app/(public)/accessibility/page.tsx`) with: scope, conformance level claimed (WCAG 2.2 AA), known limitations, contact email, last-reviewed date. EAA basically requires this.
3. Add a complaints log (a Linear/GitHub label is fine; reference it from the statement).

## A202 — M&A diligence pack

**Verdict: PARTIAL. The repo holds many of the technical artifacts; the corporate ones are out of scope.**

| Item | In repo? | Where |
|---|---|---|
| Cap table | No (corporate) | n/a |
| IP register | Partial (NOTICE.md + LICENSE) | NOTICE.md |
| Contracts (assignment vs CoC) | No (corporate) | n/a |
| Customer concentration | No (analytics out of scope) | n/a |
| Security questionnaires | Partial — DPAs + threat model + SOC2 mapping cover most CAIQ/SIG questions | docs/* |
| Prior incidents | Partial — `docs/security-incidents.md` exists | docs/security-incidents.md |
| Litigation | No (corporate) | n/a |
| Audit reports | No (external) | n/a |

### Recommendations

1. The repo is in unusually good shape for the **technical** half of a diligence pack. Consolidate references in `docs/evidence-pack.md` (already exists) so a buyer can read one entry-point document.
2. Quarterly cadence to refresh the evidence pack — already implied by `docs/compliance-evidence.md`. Make it explicit.

## A203 — Board cyber report

**Verdict: NOT IN REPO. Corporate artifact.**

The repo does have telemetry hooks that would feed a board report:

- Sentry → MTTD/MTTR proxies (alert-to-acknowledge; alert-to-resolve)
- `docs/slo.md` + Cloudflare/Sentry dashboards → SLO burn rate
- Dependabot + `docs/npm-audit-report.txt` → critical CVE count
- `docs/security-incidents.md` → incident history
- DR drill log (`.github/workflows/dr-drill.yml`)

Missing for a proper board pack:

| Item | Status |
|---|---|
| Top-10 risk register with trend | Threat model exists but isn't in "trend" form |
| MTTD / MTTR / MTTC tracked | Not aggregated |
| Critical CVEs > SLA count | Dependabot alerts visible but no aging report |
| Phish-sim click rate | Not in scope (HR / IT) |
| Training % | Not in scope (HR / IT) |
| Vendor risk | Partial — `docs/vendor-dpas.md` |
| Cyber insurance | Not in repo (corporate) |
| Regulatory exposure | Not in repo (corporate) |

### Recommendations

1. Add `scripts/board-cyber-report.ts` that pulls Dependabot + Sentry incident counts + DR drill last-pass timestamp + audit-log row count and renders a one-pager. That's the part the codebase can actually produce; the rest is HR/IT/Finance/Legal.

## A204 — ESG (Scope 1/2/3, PUE, supplier code, modern slavery, conflict minerals 3TG)

**Verdict: NOT ADDRESSED in repo at all.**

| Item | Status |
|---|---|
| Scope 1 | n/a (no owned facilities visible) |
| Scope 2 | Cloudflare/Supabase/Stripe/Sentry are the energy users. Cloudflare publishes its sustainability data; you'd cite that. |
| Scope 3 | Not measured. |
| PUE | Vendor-dependent. |
| Supplier code of conduct | Not in repo. |
| Modern Slavery (UK MSA / SB-657 / AU MSA / LkSG) | Not in repo. **If you have UK turnover > £36m, AU > A$100m, or sell into Germany under LkSG, this is a statutory disclosure obligation.** |
| Conflict minerals (3TG) | Software-only — likely N/A unless you ship hardware. |

### Recommendations

1. ESG is genuinely out of scope for this codebase. **Action**: get legal/finance to determine which thresholds apply (UK MSA, CA SB-657, AU MSA, German LkSG, EU CSRD if your group is in scope from FY2025 onward), then publish statements separately.
2. For Scope 2: cite Cloudflare's renewable matching and Supabase/AWS region data — it's the cheapest and most accurate scope you can claim.

---

# Summary scorecard

| Area | Verdict | Severity of gaps |
|---|---|---|
| A163 ASC 606 | Out of scope; mid-cycle tier change blind spot | Medium |
| A164 Tax | Not implemented; **enable Stripe Tax** | High if cross-border B2C |
| A165 SOD | RBAC strong, no SOD matrix | Medium |
| A166 Close pipeline | Idempotent ingestion strong; **no daily reconciliation** | Medium |
| A167 Money tables | Strong; **Stripe writes skip audit_log**, **commissions writes skip audit_log**, **purge deletes audit rows** | Medium |
| A168 Pricing/discount | Mostly N/A | Low |
| A169 Refunds/disputes | **Refunds, disputes, payment failures NOT handled in webhook** | **High** |
| A170 ITGC / SOX 404 | Strong docs; missing period-of-reliance dates | Low |
| A197 IP hygiene | NOTICE.md good; **PIIA / invention assignment not in repo** (corporate) | Medium |
| A198 Export controls | **Not addressed**; needs ECCN + sanctioned-country block | Medium |
| A199 Marketing claims | Affiliate disclosure good; substantiation file missing | Low |
| A200 Children's data | Not addressed; likely OK if not targeting children | Low (declare in privacy policy) |
| A201 Accessibility | Strong WCAG 2.1 AA testing; **no public statement, no WCAG 2.2 coverage, EAA 2025 risk** | Medium |
| A202 M&A pack | Technical half is exceptionally complete; corporate half out of scope | Low |
| A203 Board cyber | Telemetry exists; not aggregated into a board format | Low |
| A204 ESG | Not addressed | Depends on jurisdiction thresholds |

# Top-5 highest-leverage fixes (everything else can wait)

1. **Add `charge.refunded`, `charge.dispute.created`, `invoice.payment_failed` to `lib/stripe-event-processor.ts`** and the matching ops in `apply_stripe_membership_event`. (A169 — High)
2. **Enable Stripe Tax + tax-ID collection** in `app/api/membership/checkout/route.ts`. One-line change, eliminates VAT/GST exposure for most cases. (A164 — High)
3. **Have `apply_stripe_membership_event` write to `audit_log` inside the transaction** with `actor='stripe-webhook'`. Closes the "money table mutated, no audit row" gap. (A167)
4. **Add a daily Stripe ↔ Supabase reconciliation cron** in `app/api/cron/stripe-sync/route.ts` with Sentry variance alerts. (A166)
5. **Publish an Accessibility Statement page** (`app/(public)/accessibility/page.tsx`) with WCAG 2.2 AA conformance, last-reviewed date, contact, and remediation roadmap. EU EAA deadline was 2025-06-28. (A201)

Items 1–3 are repo-level fixes a single PR each. Item 4 is a half-day. Item 5 is a copy-paste page + a calendar reminder.

Items needing **counsel / business owner** (not Devin):

- A164 jurisdiction nexus map
- A165 SOX SOD matrix sign-off
- A170 period-of-reliance dates
- A197 PIIA / invention-assignment templates
- A198 ECCN classification + BIS encryption registration
- A199 substantiation file (legal review of marketing copy)
- A200 children's-data statement in privacy policy
- A201 EAA 2025 conformance statement (copy)
- A203 board cyber pack
- A204 modern slavery / ESG disclosures
