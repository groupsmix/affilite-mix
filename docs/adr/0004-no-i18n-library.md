# ADR-0004: No i18n Library (Per-Site Language via Ternaries)

**Status:** Accepted (with known limitations)
**Date:** 2026-04-30 (documented retroactively)
**Deciders:** Platform team

## Context

The platform serves content in English and Arabic across multiple tenant sites. Options considered:
1. `next-intl` or `react-intl` (full i18n framework)
2. `i18next` (standalone i18n)
3. Per-component ternaries based on `site.language`

## Decision

Use per-component ternaries (`isAr ? "Arabic" : "English"`) without an i18n library.

## Rationale

- Only 2 languages needed at launch (English, Arabic)
- No plural-form complexity needed for initial launch (Arabic has 6 plural forms -- this is a known gap)
- Avoids bundle-size overhead of i18n libraries
- RTL support handled via `dir` attribute on `<html>` based on site config

## Consequences

- Adding a 3rd language requires editing every component with translatable strings
- No CLDR plural rules -- Arabic plurals are incorrect for counts
- No string externalisation -- translations cannot be managed by non-developers
- No locale selector in admin UI

## Known limitations (from audit A92)

- String concatenation with HTML in `cookie-consent-cmp.tsx` is an injection risk if URLs become user-supplied
- Admin UI is English-only
- Date/number/currency formatting defaults to `en-US` in some admin components

## Recommendation

If a 3rd language is needed or the platform scales beyond 5 sites, migrate to `next-intl` with extracted message files.

## Evidence

- `app/(public)/privacy/page.tsx`, `app/(public)/terms/`, `app/(public)/search/page.tsx`
- `config/site-definition.ts` (`language`, `direction` fields)
