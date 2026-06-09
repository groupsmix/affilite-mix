# F-004 — Custom JWT Admin Auth: Design Review

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main`
**Finding:** F-004 (external audit, 2026-06-03) — "Custom home-grown JWT admin auth stack" flagged for design review.
**Reviewer:** Vellum (audit-continuation pass)
**Verdict:** **PASS.** The custom JWT stack implements the controls a hand-rolled auth system most often gets wrong. No code-level vulnerability identified. Residual observations are architectural trade-offs, documented below.

---

## Why this was a flagged "blind spot"

The external audit could not see runtime behaviour and treated a custom JWT stack as inherently high-risk (the usual failure modes: `alg:none` / algorithm confusion, missing audience/issuer, no revocation, no rotation, indefinite sessions). This review inspects the implementation directly and maps each classic failure mode to the control that prevents it.

## Control map

| Classic JWT failure mode                          | Status                    | Evidence                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Algorithm confusion (`alg:none`, RS→HS) — CWE-347 | **Prevented**             | Verify pins `algorithms: ["HS256"]`; signing sets `alg:HS256` + `kid`. `lib/auth.ts` (`verifyToken`, `signToken`).                                                                                                                                                                                                                    |
| Missing audience / issuer binding                 | **Prevented**             | `setAudience("affilite-mix-admin")` + `setIssuer("affilite-mix-auth")` at sign; both enforced at verify. `lib/auth.ts`.                                                                                                                                                                                                               |
| No unique token id (replay / no revoke handle)    | **Prevented**             | `setJti(crypto.randomUUID())` on every mint. `lib/auth.ts`.                                                                                                                                                                                                                                                                           |
| No revocation                                     | **Prevented (dual-tier)** | `lib/jwt-revocation.ts` (KV blocklist, **fails closed** in prod) + `lib/jwt-revocation-strong.ts` (KV **and** in-memory immediate blocklist for password change / forced logout / role change — shrinks the cross-isolate window from ~60s to next-request). Verify checks `isTokenRevokedImmediate()` then `isTokenRevoked()`.       |
| Indefinite sessions via refresh                   | **Prevented**             | 4h JWT expiry (`ADMIN_JWT_EXPIRY_SECONDS`) + absolute session ceiling via carried `session_start` claim, role-aware (`MAX_SESSION_AGE_ADMIN_SECONDS` vs `…_REGULAR_SECONDS`) + idle timeout (`IDLE_TIMEOUT_MS`). `lib/auth.ts`.                                                                                                       |
| Key rotation impossible / unsafe                  | **Handled**               | `kid` header + current/previous secret with a grace window; the 24h rotation window is re-checked **on every verification**, not just startup (F-013). `lib/auth.ts`, `lib/jwt-secret.ts`.                                                                                                                                            |
| Stolen-token replay from another device           | **Mitigated**             | Optional `bnd` binding claim = hash of user-agent + role-aware IP fingerprint (super*admin `/32`, others `/24` to tolerate NAT). When a token \_carries* `bnd` it is **always** verified regardless of the operator toggle; the flag only governs whether a token _missing_ `bnd` is acceptable. `lib/jwt-binding.ts`, `lib/auth.ts`. |
| Clock-skew / wrong-edge-clock acceptance          | **Prevented**             | Rejects tokens with `iat` more than 30s in the future, checked after **both** key branches (a prior bug let previous-key fallbacks skip it). `lib/auth.ts`.                                                                                                                                                                           |
| Cookie theft via XSS / CSRF / downgrade           | **Mitigated**             | `__Host-` cookie prefix in production (implies Secure + path=/ + no Domain), HttpOnly, SameSite; CSRF double-submit enforced in middleware. `lib/cookie-utils.ts`, `lib/middleware/csrf.ts`.                                                                                                                                          |
| Single password factor                            | **Hardened**              | TOTP MFA verified at login; **required** for `super_admin` (login refuses un-enrolled super_admins); secrets stored encrypted with a SHA-256 re-enrollment path. `app/api/auth/login/route.ts`, `lib/totp.ts`.                                                                                                                        |
| One flag disables many defences                   | **Prevented**             | Each hardening control (revocation, binding, absolute lifetime) reads its own flag under an `ADMIN_SESSION_STRICT` umbrella, so a single typo can't silently disable three defences. `lib/auth.ts` (SEC-CRIT-04).                                                                                                                     |

## Residual observations (trade-offs, not defects)

1. **HS256 is symmetric.** The same secret signs and verifies. This is correct and simplest for a single-service admin surface. It would only need to move to an asymmetric algorithm (RS256/EdDSA) if a _separate_ service ever had to verify admin tokens without holding the signing secret. No action needed today; noted so a future multi-service split revisits it.

2. **IP-based binding can cause false-positive logouts.** A `super_admin` bound to `/32` who changes networks mid-session is logged out and must re-auth. This is the intended security/usability trade-off (tightest binding for the most privileged role, and super_admins are few). Non-privileged roles use `/24` to tolerate mobile NAT shifts. Acceptable; revisit only if super_admin re-auth friction is reported.

3. **Cross-isolate revocation has a bounded propagation window.** Non-"strong" revocations rely on KV (~60s eventual consistency). The security-critical operations (password change, forced logout, role change) use the strong path (immediate in-memory + KV), so the residual window applies only to lower-stakes revocations. Documented and acceptable.

## Recommendation

No remediation required for F-004. Close as **reviewed — pass**. The three residual observations are architectural notes for future revisiting, not open security gaps. The controls above should be treated as a regression surface: the existing suites (`__tests__/` auth/JWT/binding/revocation tests) already pin most of them; keep that coverage when refactoring `lib/auth.ts`.
