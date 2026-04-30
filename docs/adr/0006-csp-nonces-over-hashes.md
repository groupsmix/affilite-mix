# ADR-0006: CSP Nonces over Hashes

**Status:** Accepted
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

Content Security Policy (CSP) can allow inline scripts/styles via either:
1. Hash-based (`'sha256-...'`) -- requires knowing all inline scripts at build time
2. Nonce-based (`'nonce-...'`) -- generates a fresh random value per request

## Decision

Use per-request nonce-based CSP generated in middleware.

## Rationale

- Next.js injects inline runtime scripts whose content changes across builds; hash-based CSP would need to be regenerated on every deploy
- Nonce-based CSP is the recommended approach per Next.js documentation
- Fresh 16-byte nonce per request prevents nonce reuse across requests
- Middleware generates the nonce and propagates via request headers; Next.js auto-applies it to its own inline scripts

## Consequences

- Every non-API request pays the cost of `crypto.getRandomValues(16)` + base64 encoding
- The nonce must be propagated to all inline `<script>` and `<style>` tags
- CSP report-uri/report-to configured for violation monitoring (`app/api/csp-report/route.ts`)

## Evidence

- `lib/csp.ts` (`generateCspNonce`, `buildCspHeader`)
- `middleware.ts` (nonce injection into request/response headers)
- `__tests__/csp.test.ts`
