# Regex Inventory (ReDoS Census)

> **A11 Remediation** — Inventory of all regular expressions used in the codebase to assess and mitigate Regular Expression Denial of Service (ReDoS) risks.

---

## 1. Codebase Regex Census

| Location | Regex Pattern | Purpose | Risk Assessment |
|---|---|---|---|
| `lib/validate-email.ts` | `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` | Basic email format validation | **Low**: Simple pattern, non-backtracking. |
| `lib/security/input-sanitize.ts` | `/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g` | Control character stripping | **Low**: Character class matches only. |
| `lib/security/input-sanitize.ts` | `/[^a-z0-9\-_]/g` | Slug sanitization | **Low**: Character class matches only. |
| `lib/security/input-sanitize.ts` | `/-{2,}/g` | Collapsing multiple dashes | **Low**: Simple quantifier. |
| `lib/security/input-sanitize.ts` | `/^-|-$/g` | Trimming dashes | **Low**: Anchor matches only. |
| `lib/url-utils.ts` | `/(https?:\/\/[^\s]+)/g` | URL extraction from text | **Medium**: Potential for catastrophic backtracking if URLs are nested or malformed. |
| `middleware.ts` | `/^\/(admin\|api\|_next\|static\|favicon.ico)/` | Route exclusion for middleware | **Low**: Simple prefix match. |
| `lib/dal/search-utils.ts` | `/[()\|&!:*<>]/g` | tsquery special char stripping | **Low**: Character class matches only. |

---

## 2. High-Risk Pattern Mitigation

### URL Extraction (`lib/url-utils.ts`)
The pattern `(https?:\/\/[^\s]+)` is currently used to find URLs in product descriptions. While not deeply nested, long strings of non-whitespace characters can cause overhead in some engines.
**Mitigation:** Enforce a hard length limit on the input string (max 10,000 chars) before running the regex.

### Email Validation
The current regex is a "loose" check. Avoid switching to a "RFC 5322" compliant regex which are notoriously complex and prone to ReDoS.
**Mitigation:** Stick to the current simple pattern or use a dedicated library like `validator.js`.

---

## 3. Policy for New Regexes

1. **Avoid Nested Quantifiers:** Patterns like `(a+)+` are forbidden.
2. **Use Character Classes:** Prefer `[a-z]+` over `(a|b|c...)+`.
3. **Limit Input Length:** Always truncate strings to a reasonable maximum (e.g., 4096 characters) before applying a regex.
4. **Test with `Safe-Regex`:** Run all new complex patterns through a ReDoS checker before merging.
5. **Atomic Grouping:** Use atomic grouping `(?>...)` or possessive quantifiers `*+` where supported if backtracking is not needed. (Note: standard JS regex does not support these, so use lookaheads for emulation if necessary).

---

## 4. ReDoS Audit Log

| Date | File | Pattern | Change |
|---|---|---|---|
| 2026-05-15 | `lib/url-utils.ts` | `/(https?:\/\/[^\s]+)/g` | Added 10k character truncation before execution. |
| 2026-05-15 | `lib/security/input-sanitize.ts` | (new) | Designed for linear time complexity (char class only). |
