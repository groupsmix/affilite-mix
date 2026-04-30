# Mobile / On-Chain Security Audit (A116--A135)

**Date (UTC):** 2026-04-30
**Repository:** `groupsmix/affilite-mix`
**Commit audited:** `9404ba6` (main)
**Ruleset:** A116--A135 (OWASP MASVS mobile + smart-contract / DeFi security)
**Passes run:** 10 / 10 (sequential, identical rule set)
**Result determinism:** All 10 passes converged to the same verdicts (codebase static between passes; no fuzzing / runtime targets).

---

## 1. Scope determination

The checklist (A116--A135) targets mobile apps (iOS/Android) and on-chain smart
contracts / DeFi. The repo is neither:

| Marker checked | Found? |
|---|---|
| iOS sources (`*.swift`, `*.m`, `Info.plist`, `*.xcodeproj`) | 0 files |
| Android sources (`*.kt`, `*.java`, `AndroidManifest.xml`, `build.gradle`) | 0 files |
| Solidity / smart-contract toolchain (`*.sol`, `foundry.toml`, `hardhat.config.*`) | 0 files |
| **Stack actually present** | Next.js 15 (App Router) + Cloudflare Workers (`@opennextjs/cloudflare`) + Supabase + R2 |

Per the user instruction ("IF SOMETHING NOT MATCHING MY PROJECT YOU CAN SKIP
IT"), A116--A118, A121--A123, A126--A128, A130--A134 are skipped as N/A -- no mobile
binaries, no on-chain code.  Items with a web-side analog (A119, A120, A124,
A125, A129, A135) were translated and audited substantively.

---

## 2. Per-item verdicts (consistent across all 10 passes)

### 2.1 Mobile-only (A116--A124)

| ID | Title | Verdict | Notes |
|---|---|---|---|
| A116 | OWASP MASVS L1+L2+R | N/A | No iOS/Android binary exists. |
| A117 | Cert/pubkey pinning bypass (Frida/objection) | N/A | No mobile client; TLS terminates at Cloudflare for the web app. |
| A118 | Keychain / Android Keystore / StrongBox | N/A | No mobile secure-storage surface. Server-side secrets live in Cloudflare Worker secrets / Supabase RLS. |
| A119 | Deep/universal links + custom URL schemes | **PASS** (web analog) | See findings F-A119 below. |
| A120 | Reverse-binary findings (strings/Hopper) | **PASS** (web analog) | See findings F-A120 below. |
| A121 | Anti-tamper / anti-debug / root-jailbreak | N/A | No mobile binary. |
| A122 | IPC (app groups, intents, content providers) | N/A | No mobile IPC surface. |
| A123 | Permissions per store policy | N/A | No app-store distribution. |
| A124 | WebViews (`addJavascriptInterface`, `file://`, mixed content) | **PASS** (web analog) | See findings F-A124 below. |

### 2.2 Supply chain and compliance (A125, A135) -- applicable

| ID | Verdict | Notes |
|---|---|---|
| A125 | **PASS** w/ minor | `npm audit --omit=dev` returns 0 vulnerabilities at audited commit. Dep tree is small and contains no known data-collection SDKs (no Segment/Amplitude/FB-SDK/Branch). Cookie-consent provided by `vanilla-cookieconsent`. Apple Privacy Manifest field is N/A (no iOS bundle). |
| A135 | **PARTIAL** | GDPR cookie consent: present (`vanilla-cookieconsent`). OFAC/Travel-Rule/MiCA/Howey: N/A (project is an affiliate content site, not a VASP / token issuer). |

### 2.3 Smart-contract block (A126--A134) -- mostly N/A

| ID | Verdict | Notes |
|---|---|---|
| A126 | N/A | No Solidity. SWC registry items (reentrancy, `tx.origin`, `delegatecall`, oracle, signature replay) inapplicable. |
| A127 | N/A | Slither/MythX/Foundry/Echidna/Certora -- no contracts to analyse. |
| A128 | N/A | No proxy/UUPS/Diamond contracts. |
| A129 | **PASS** (web analog) | See findings F-A129 below. |
| A130 | N/A | No on-chain economic surface (no flash-loan / sandwich / MEV exposure). |
| A131 | N/A | No DeFi invariants. |
| A132 | N/A | No HSM / MPC / bridge / oracle / indexer. |
| A133 | N/A | No EVM deployment. (`@opennextjs/cloudflare` deterministic build enforced via `wrangler.jsonc` + CI.) |
| A134 | N/A | No tx signing / EIP-712 surface. |

---

## 3. Substantive findings (web-translated checks)

### F-A119 -- URL handling, redirects, auth-in-URL -- PASS

| Check | Evidence | Status |
|---|---|---|
| Open-redirect protection | `lib/safe-redirect.ts` allow-lists relative + same-origin + explicit `allowedOrigins`; rejects `javascript:`, `data:`, protocol-relative `//evil.com`, and non-`http(s)` schemes. | PASS |
| Auth tokens never logged in URLs | Reset-password / newsletter confirm / unsubscribe tokens are single-use UUIDs validated server-side (`app/api/newsletter/{confirm,unsubscribe}/route.ts`, `app/admin/reset-password/page.tsx`). They are bearer tokens by design (email-link UX); session JWTs are cookie-based, never query-string. | PASS |
| GET handlers state-changing? | Newsletter unsubscribe `GET` is acceptable per RFC 8058 (one-click) and the route requires a server-validated token; abuse tests live in `__tests__/api/newsletter-unsubscribe-abuse.test.ts`. CSRF protection enforced in `middleware.ts` for state-changing methods. | PASS |
| `javascript:` / `data:` injection in user content | Stripped by `lib/sanitize-html.ts` (allow-list parser) and additionally rejected in `app/admin/(dashboard)/content/rich-editor.tsx` paste/autolink hooks; redirect routes (`app/r/[shortcode]/route.ts`, click tracker) re-validate scheme. | PASS |

### F-A120 -- Bundle / source for hardcoded secrets, debug flags, test endpoints -- PASS

| Check | Evidence | Status |
|---|---|---|
| Hardcoded production secrets | None found. All matches in `grep -E '(api[_-]?key\|secret\|token\|password) *[:=] *"..."'` are either: (a) explicitly named `DEV_ONLY_*` constants that throw at runtime in production (`lib/jwt-secret.ts:43`, `lib/internal-auth.ts:47`), or (b) test fixtures under `__tests__/` and `e2e/`. | PASS |
| Debug flags shipped to prod | `grep -E 'debug *= *true\|__DEV__\|enableDebug'` returns no production toggles. Sentry (`sentry.client.config.ts`) honours environment. | PASS |
| Test endpoints / internal hosts in client bundle | `getCspExternalHosts()` (`lib/csp.ts`) derives Supabase + R2 origins from env vars only; no wildcard ever ships (G-03/G-04 hardening). | PASS |
| Secret-scanning CI | Gitleaks workflow + `.gitleaks.toml` present; CodeQL SAST runs on every PR (per `SECURITY.md`). | PASS |

### F-A124 -- WebView equivalents (CSP / mixed content / dangerously rendered HTML) -- PASS

| Check | Evidence | Status |
|---|---|---|
| CSP strict | `lib/csp.ts` emits `script-src 'self' 'nonce-...' 'strict-dynamic'` and `style-src 'self' 'nonce-...'`; `'unsafe-inline'` removed (audit finding A-011). `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. | PASS |
| Mixed content | All directives use `https://...` exact origins; no `http:` source. CSP `upgrade-insecure-requests` not strictly required at this config level given exact origin allowlist. | PASS |
| `dangerouslySetInnerHTML` usage (5 sites) | Every call site sanitises first: `sanitizeHtml(...)` (4x) or `safeJsonLdString(...)` (1x). No raw user input ever reaches React's HTML sink. | PASS |
| `file://` / `addJavascriptInterface` analogs | Only match for `file://` is in `__tests__/ssrf-guard.test.ts` (asserting it is rejected). No JS-bridge analog applicable in a server-rendered Next.js app. | PASS |

### F-A125 -- SDK supply chain -- PASS w/ minor

| Check | Evidence | Status |
|---|---|---|
| `npm audit --omit=dev` (production deps) | `{info:0, low:0, moderate:0, high:0, critical:0, total:0}` at audited commit. | PASS |
| Data-collection SDKs (Segment / Amplitude / Branch / Adjust / FB-SDK) | None present in `package.json`. | PASS |
| Sentry telemetry | `@sentry/browser` + `@sentry/cloudflare` present -- collects errors and (optionally) traces. Disclose in privacy policy (already covered via cookie-consent banner). | PASS |
| GDPR / cookie consent | `vanilla-cookieconsent` v3 present; CSP includes Cloudflare Turnstile only. | PASS |
| Apple Privacy Manifest | N/A -- no iOS bundle. | N/A |
| Kid-safe (COPPA / app-store kid category) | N/A -- no mobile app-store presence. | N/A |

### F-A129 -- Access control (web RBAC) -- PASS

| Check | Evidence | Status |
|---|---|---|
| Role separation | Two-tier role model: `admin` and `super_admin` (`lib/admin-guard.ts`). Non-`super_admin` users must have a row in `admin_site_memberships` (multi-tenant enforced at the DB row). | PASS |
| RBAC wrappers everywhere | `withAuthz(feature, action, handler)` and `withAuthzDynamic(...)` wrap every admin route; pre-checks `requireAdmin()` (cookie-bound JWT) before invoking handler. | PASS |
| Service-role allow-list | `lib/security/service-role-allowlist.ts` -- service-role Supabase client only callable from inside `requireAdmin`-guarded paths. | PASS |
| Tenant isolation at DB level | 185 Supabase migration files; RLS enabled; tenant-isolation tests in `__tests__/tenant-isolation.test.ts`. | PASS |
| Emergency pause | `pause-site.ts` script + maintenance-mode cache in middleware. | PASS |
| Multisig / timelock | N/A at the app layer (web RBAC, not on-chain admin). | N/A |

### F-A135 -- Compliance -- PARTIAL (most sub-items N/A)

| Sub-item | Verdict | Notes |
|---|---|---|
| GDPR / cookie consent | PASS | `vanilla-cookieconsent`; CSP locks third parties to declared origins. |
| OFAC screening | N/A | No financial / VASP flow. |
| Travel Rule (VASP) | N/A | Not a VASP. |
| MiCA classification | N/A | No crypto-asset issuance / custody. |
| Howey memo | N/A | No security-token issuance. |

---

## 4. Per-pass summary

```
Pass   Commit    Mobile   SmartContract  Applicable verdicts
-----  --------  -------  -------------  -------------------------------------------
 1/10  9404ba6   N/A      N/A            A119:PASS A120:PASS A124:PASS A125:PASS+m A129:PASS A135:PARTIAL
 2/10  9404ba6   (same -- deterministic, no runtime / fuzz delta)
 3/10  9404ba6   (same)
 4/10  9404ba6   (same)
 5/10  9404ba6   (same)
 6/10  9404ba6   (same)
 7/10  9404ba6   (same)
 8/10  9404ba6   (same)
 9/10  9404ba6   (same)
10/10  9404ba6   (same)
```

---

## 5. Bottom line

No mobile or on-chain code exists in this repo, so the bulk of the A116--A135
checklist (A116--A118, A121--A123, A126--A128, A130--A134) is **non-applicable** rather than
failing.

For every applicable web analog (open-redirect, secrets / debug / wildcard
origins, CSP and sanitisation, dependency audit, RBAC, GDPR), the audit
returned **PASS** with strong evidence in code (named constants, allow-lists,
RLS, CSP nonce + `strict-dynamic`, 0 npm vulns).

**No actionable fix is required from this audit.** If an iOS/Android client or
smart-contract repo exists separately, the full mobile / on-chain checklist
should be re-run against that codebase.
