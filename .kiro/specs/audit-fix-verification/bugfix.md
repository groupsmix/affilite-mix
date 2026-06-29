# Bugfix Requirements Document

## Introduction

This document captures requirements for fixing 13 security and reliability issues identified in a comprehensive audit of the application's `app/` folder. The issues span three severity tiers: four high-severity security risks (PII leakage, credential exposure, missing token revocation, missing input validation), five medium-severity bugs and reliability gaps (silent error swallowing, missing form validation, unbounded batch processing, affiliate URL exposure, unsubscribe token replay), and four low-severity code quality issues (unvalidated ref parameter, undocumented LRU bounds, hardcoded DB-sourced `lang` attribute, silent token overwrite). Each issue is captured with its current defective behavior, the correct expected behavior, and the existing behavior that must be preserved.

---

## Bug Analysis

### Current Behavior (Defect)

**Issue 1 — Data-export email embeds OTP in a clickable URL (PII leakage)**

1.1 WHEN the POST `/api/user/data-export` handler constructs the verification email, THEN the system embeds both the user's email address and the raw 6-digit OTP code in a prebuilt clickable `GET` URL (`/api/user/data-export?email=…&code=…`) inside the `emailHtml` variable, exposing the one-time code to mail proxies, spam filters, and email preview services that may silently follow the link and consume the OTP before the user sees it.

**Issue 2 — Health endpoint leaks missing env-var names via cron-auth fallback**

1.2 WHEN `HEALTH_DETAIL_BEARER` is set to a non-empty value in the environment AND a caller presents a valid `CRON_SECRET` bearer token (but not the `HEALTH_DETAIL_BEARER` token), THEN the system grants that caller full access to the `checks` object — including `checks.environment.error` which names every missing secret — because the `isAuthorized` expression uses `||` and evaluates `verifyCronAuth(request)` regardless of whether the dedicated bearer is set.

1.3 WHEN `HEALTH_DETAIL_BEARER` is set to a non-empty value AND the incoming request presents a credential that does not match it, THEN the authorization logic does not distinguish between "bearer var absent" and "bearer var set but wrong credential supplied", allowing a cron credential to bypass the dedicated bearer secret when both are configured.

**Issue 3 — Step-up route does not revoke the old JWT before re-minting**

1.4 WHEN an admin successfully completes step-up verification (correct password and TOTP if enabled) in `POST /api/auth/step-up`, THEN the system calls `createToken` and sets a new session cookie but never revokes the pre-step-up token, leaving the captured old JWT valid for up to its full remaining lifetime (up to 4 hours).

**Issue 4 — Permissions API POST/DELETE missing UUID validation**

1.5 WHEN the `POST /api/admin/permissions` handler receives a JSON body, THEN the system reads `user_id` and `site_id` and passes them directly to `assignUserSiteRole` without calling `isUsableUuid()` on either value, accepting arbitrary non-UUID strings (including the nil UUID `00000000-0000-0000-0000-000000000000`) as identifiers.

1.6 WHEN the `DELETE /api/admin/permissions` handler reads `userId` and `siteId` from query parameters, THEN the system passes them directly to `removeUserSiteRole` without calling `isUsableUuid()` on either value, accepting arbitrary non-UUID strings as identifiers.

**Issue 5 — token-refresh.tsx silently swallows refresh failures**

1.7 WHEN the `doRefresh()` function in `token-refresh.tsx` receives a 401 or 403 response from `POST /api/auth/refresh`, THEN the system catches the error and discards it without notifying the user or redirecting to login, causing the admin to continue working with an expired session until they hit a confusing 401 on their next server action.

1.8 WHEN `doRefresh()` receives any network error or non-auth server error, THEN the system discards it silently with no retry or logging, making transient failures indistinguishable from auth failures.

**Issue 6 — Login page email input missing `required` attribute**

1.9 WHEN a user submits the admin login form (`/q7m-k4j9/login`) with an empty email field, THEN the system does not trigger native browser validation and instead submits the form, resulting in a server-side 400 error response rather than a clear inline validation message, because the `<Input id="email">` element lacks the `required` attribute (unlike the password input which has `required`).

**Issue 7 — cron/data-retention audit_log uses `.limit(10000)` with no cursor batching**

1.10 WHEN the `POST /api/cron/data-retention` cron job runs and there are more than 10,000 expired `audit_log` rows, THEN the system fetches only the first 10,000 rows and deletes them, leaving the excess rows unprocessed indefinitely, causing unbounded table growth and a GDPR Art. 5(1)(e) retention violation — unlike the `affiliate_clicks` block which uses cursor-based batching to process all expired rows across multiple invocations.

**Issue 8 — gift-finder returns raw `affiliate_url` in public JSON response**

1.11 WHEN `GET /api/gift-finder` returns product results, THEN the system includes `affiliate_url: p.affiliate_url` directly in the response JSON, exposing raw affiliate tracking URLs publicly and allowing competitors to identify affiliate networks and strip tracking parameters.

**Issue 9 — Newsletter raw unsubscribe token sent in `List-Unsubscribe` header without one-time-use enforcement**

1.12 WHEN `POST /api/newsletter` constructs the outgoing confirmation email, THEN the system includes the raw (pre-hash) `unsubscribeToken` UUID directly in the `List-Unsubscribe` header value, and there is no verified guarantee that the unsubscribe handler invalidates the token after first use to prevent replay.

**Issue 10 — `/r/[shortcode]` ref param stored without slug validation**

1.13 WHEN `GET /r/[shortcode]` records a click, THEN the system passes `request.nextUrl.searchParams.get("ref") ?? ""` directly to `recordClick` as `content_slug` without applying the slug regex validation (`SLUG_RE`) that the `/api/track/click` route uses, accepting arbitrary strings including those containing special characters.

**Issue 11 — HtmlRenderer LRU cache bounds undocumented**

1.14 WHEN a developer reads `lib/sanitize-html.ts`, THEN the system provides no comment explaining that the `sanitizeHtmlMemoized` LRU cache is already protected against unbounded growth by `MEMO_CAPACITY = 64` and that key size is bounded by the `MAX_INPUT_LENGTH = 100_000` pre-check, leaving the protection invisible and at risk of being inadvertently removed in future refactors.

**Issue 12 — Admin layout `lang` attribute sourced from DB-controlled value**

1.15 WHEN the admin dashboard layout renders with an active site whose `lang` is a non-English value (e.g. `"ar"` for an Arabic content site), THEN the system sets `lang={active.lang}` on the outer `<div dir="ltr">` of the English admin shell, causing screen readers to apply the wrong speech synthesis language to the entire admin UI even though the admin interface itself is always in English.

**Issue 13 — forgot-password silently overwrites a still-valid pending reset token**

1.16 WHEN a user submits `POST /api/auth/forgot-password` a second time while a still-valid (unexpired) reset token already exists for their account, THEN the system unconditionally overwrites `reset_token` and `reset_token_expires_at` in the database, invalidating the first reset link already delivered to the user's inbox.

---

### Expected Behavior (Correct)

**Issue 1 — Data-export email OTP display**

1. WHEN the POST `/api/user/data-export` handler constructs the verification email, THEN the system SHALL display the 6-digit code as a non-linked text value within the email body and SHALL NOT embed the 6-digit code as a query parameter value inside any URL that appears in the email HTML body.

2. WHEN the POST `/api/user/data-export` handler constructs the verification email, THEN the system SHALL include a reference to the data-export route in the email body that contains the user's email address pre-filled and omits the verification code from the URL, so that the user is directed to the correct destination without exposing the code to link-following agents.

3. WHEN a user requests a data-export verification code via `POST /api/user/data-export` with a valid email, THEN the system SHALL generate a 6-digit OTP, store it in KV with a 10-minute TTL, send it by email via Resend, and return an identical 200 JSON response regardless of whether the provided email address exists in the system.

**Issue 2 — Health endpoint authorization**

4. IF `HEALTH_DETAIL_BEARER` is set to a non-empty value AND the incoming request presents that exact bearer token in the `Authorization` header, THEN the system SHALL grant access to the full `checks` object.

5. IF `HEALTH_DETAIL_BEARER` is set to a non-empty value AND the incoming request does NOT present that exact bearer token, THEN the system SHALL return only `{ status: "healthy" }` without the `checks` object and SHALL NOT evaluate `verifyCronAuth(request)`, regardless of whether the request also presents a valid `CRON_SECRET`.

6. IF `HEALTH_DETAIL_BEARER` is unset or set to an empty string AND `NODE_ENV !== "production"` AND the request presents a valid cron credential, THEN the system SHALL fall back to `verifyCronAuth(request)` and grant access to the full `checks` object.

7. IF `HEALTH_DETAIL_BEARER` is unset or set to an empty string AND no valid cron credential is presented, THEN the system SHALL return only `{ status: "healthy" }` without any `checks` detail, regardless of environment.

**Issue 3 — Step-up JWT revocation**

8. WHEN an admin successfully completes step-up verification AND the current session has a `jti` claim, THEN the system SHALL revoke the old token using the strong revocation primitive (immediate in-memory blocklist + KV persistence) before setting the new session cookie, so the pre-step-up token is rejected on the very next request.

9. WHEN an admin successfully completes step-up verification AND the current session does not have a `jti` claim, THEN the system SHALL proceed to re-mint the session cookie without attempting revocation and SHALL still return an HTTP success response.

10. WHEN the strong revocation call fails for any reason during step-up, THEN the system SHALL capture the exception, proceed to set the new session cookie, and return an HTTP success response rather than blocking the step-up.

11. WHEN an admin successfully completes step-up verification, THEN the new session cookie SHALL carry a fresh `step_up_at` timestamp, the same `userId`, `email`, and `role` claims as the previous session, and the same `session_start` value.

**Issue 4 — Permissions API UUID validation**

12. WHEN the `POST /api/admin/permissions` handler receives a JSON body with `user_id` and `site_id` values that are both well-formed, non-nil UUIDs as determined by `isUsableUuid()`, THEN the system SHALL invoke `assignUserSiteRole` with those values.

13. IF `user_id` in the `POST /api/admin/permissions` JSON body is not a well-formed, non-nil UUID, THEN the system SHALL return HTTP 400 with an error message identifying `user_id` as the invalid field without invoking any DAL function.

14. IF `site_id` in the `POST /api/admin/permissions` JSON body is not a well-formed, non-nil UUID, THEN the system SHALL return HTTP 400 with an error message identifying `site_id` as the invalid field without invoking any DAL function.

15. WHEN the `DELETE /api/admin/permissions` handler receives `user_id` and `site_id` query parameters that are both well-formed, non-nil UUIDs, THEN the system SHALL invoke `removeUserSiteRole` with those values.

16. IF `user_id` in the `DELETE /api/admin/permissions` query string is not a well-formed, non-nil UUID, THEN the system SHALL return HTTP 400 with an error message identifying `user_id` as the invalid field.

17. IF `site_id` in the `DELETE /api/admin/permissions` query string is not a well-formed, non-nil UUID, THEN the system SHALL return HTTP 400 with an error message identifying `site_id` as the invalid field.

**Issue 5 — token-refresh auth error handling**

18. WHEN `doRefresh()` receives a 401 or 403 HTTP response from `POST /api/auth/refresh`, THEN the system SHALL redirect the browser to `/q7m-k4j9/login` to prompt re-authentication, rather than silently discarding the error.

19. WHEN `doRefresh()` receives a network error, a 429 response, or a 5xx HTTP response from `POST /api/auth/refresh`, THEN the system SHALL treat the failure as transient, take no immediate user-visible action, and allow the next scheduled refresh interval to retry.

20. WHEN `doRefresh()` receives a 2xx response from `POST /api/auth/refresh`, THEN the system SHALL take no user-visible action and the session cookie SHALL be silently renewed.

**Issue 6 — Login email input required attribute**

21. WHEN a user attempts to submit the admin login form in the credential-entry state (not the 2FA state) with an empty email field, THEN the browser SHALL block form submission and display a native inline validation message, and no network request SHALL be made to `/api/auth/login`.

22. WHERE the admin login form is rendered in the credential-entry state, the `<Input id="email">` element SHALL have the `required` attribute present.

23. WHEN the admin login form is submitted with both the email and password fields populated with non-empty values, THEN the system SHALL send the credentials to `/api/auth/login` and process the server response as before.

**Issue 7 — audit_log cursor-based batching**

24. WHEN the data-retention cron runs and there are expired `audit_log` rows to process, THEN the system SHALL read the `data-retention:audit-log` checkpoint from `cron_state` before fetching the first batch, and SHALL fetch only rows with `id > last_id` (or all rows if no checkpoint exists), ordered by `id` ascending, limited to `BATCH_SIZE = 5000` rows per batch.

25. WHEN a batch of expired `audit_log` rows has been fetched, THEN the system SHALL archive those rows to R2 before deleting them, using the same archive-first sequence as the existing implementation, and SHALL persist the last processed `id` to the `data-retention:audit-log` checkpoint in `cron_state` after each successful batch.

26. WHEN a batch of expired `audit_log` rows is smaller than `BATCH_SIZE`, THEN the system SHALL treat that as the final batch, clear the `data-retention:audit-log` checkpoint, and stop processing further batches for that cron run.

27. WHEN the data-retention cron processes `affiliate_clicks`, THEN the system SHALL continue to use cursor-based batching with `cron_state` checkpointing and `BATCH_SIZE = 5000`.

**Issue 8 — gift-finder affiliate URL suppression**

28. WHEN `GET /api/gift-finder` maps product results for the JSON response, THEN the system SHALL NOT include an `affiliate_url` field in any result object.

29. WHEN `GET /api/gift-finder` maps a product result where `p.slug` is a non-empty string, THEN the system SHALL include a `redirect_url` field in that result object with the value `/r/${p.slug}`.

30. WHEN `GET /api/gift-finder` maps a product result where `p.slug` is null, undefined, or an empty string, THEN the system SHALL omit the `redirect_url` field from that result object.

31. WHEN `GET /api/gift-finder` is called with valid parameters, THEN the system SHALL return up to 3 scored product recommendations each containing the fields: `name`, `slug`, `price_label`, `price_amount`, `price_currency`, `score`, `image_url`, `description`, `merchant`, `deal_text`, and `redirect_url` (where applicable), and SHALL NOT contain `affiliate_url`.

**Issue 9 — Newsletter unsubscribe token one-time-use**

32. WHEN `POST /api/newsletter` sends a confirmation email, THEN the `List-Unsubscribe` header SHALL contain a URL with the raw (pre-hash) unsubscribe token as a query parameter, enabling RFC 8058 one-click unsubscribe.

33. WHEN a subscriber uses their unsubscribe token to call the unsubscribe handler for the first time, THEN the system SHALL set the subscriber's status to `"unsubscribed"` (or equivalent inactive state) and invalidate the token so it cannot be used again.

34. WHEN a subscriber's already-consumed unsubscribe token is submitted to the unsubscribe handler a second time, THEN the system SHALL return a success response without further state change (idempotent), and SHALL NOT re-activate or otherwise alter the subscriber record.

**Issue 10 — ref param slug validation**

35. WHEN `GET /r/[shortcode]` reads a `ref` query parameter whose value matches the slug pattern `^[a-z0-9][a-z0-9._-]{0,127}$`, THEN the system SHALL pass that value unchanged to `recordClick` as `content_slug`.

36. IF the `ref` query parameter value does not match `^[a-z0-9][a-z0-9._-]{0,127}$`, THEN the system SHALL pass an empty string `""` to `recordClick` as `content_slug` and SHALL NOT store the invalid value.

37. WHEN `GET /r/[shortcode]` is called without a `ref` query parameter, THEN the system SHALL pass an empty string `""` to `recordClick` as `content_slug`.

**Issue 11 — LRU cache bounds documentation**

38. WHERE the `sanitizeHtmlMemoized` function is defined in `lib/sanitize-html.ts`, the function-level documentation SHALL state that the LRU cache is bounded to `MEMO_CAPACITY = 64` entries, that cache key size is bounded by the `MAX_INPUT_LENGTH = 100_000` character pre-check executed before every cache lookup, and that these two invariants together prevent unbounded memory growth even under adversarial input.

39. WHEN `lib/sanitize-html.ts` sanitizes HTML content up to `MAX_INPUT_LENGTH` characters, THEN the system SHALL apply the existing tag/attribute allowlist, URL scheme validation, nesting-depth limit, and text-node escaping unchanged — the added documentation SHALL NOT alter any runtime behavior.

**Issue 12 — Admin layout lang attribute**

40. WHERE the admin dashboard layout `<div>` shell element is defined in `app/q7m-k4j9/(dashboard)/layout.tsx`, the `lang` attribute SHALL be set to the static string `"en"` regardless of the active site's language value.

41. WHEN the admin dashboard renders with an active site that has a non-English `lang` value, THEN the site's CSS variables (theme colors) SHALL continue to be applied via `style={active.cssVars}` on the shell element for visual styling.

42. WHEN the admin dashboard renders with no active site, THEN the shell element SHALL render with `lang="en"` and `dir="ltr"`.

**Issue 13 — forgot-password idempotent token generation**

43. WHEN `POST /api/auth/forgot-password` is called for an account that already has an unexpired reset token (i.e. `reset_token_expires_at > now`), THEN the system SHALL return HTTP 200 with the same JSON success body as the new-token path without overwriting the existing token or sending a new email.

44. WHEN `POST /api/auth/forgot-password` is called for an account that has no reset token, or whose reset token has expired (`reset_token_expires_at <= now`), THEN the system SHALL generate a new token, overwrite the stored hash and expiry, and send a fresh reset email.

45. WHEN `POST /api/auth/forgot-password` is called for an email address that does not correspond to any admin user, THEN the system SHALL return HTTP 200 with the same JSON success body as a successful request, after a delay of 100–500 ms to prevent email enumeration via response timing.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user requests a data-export verification code via `POST /api/user/data-export` with a valid email, THEN the system SHALL generate a 6-digit OTP, store it in KV with a 10-minute TTL, send it by email via Resend, and return a generic 200 success response regardless of whether the email exists.

3.2 WHEN an authorized caller presents the correct `HEALTH_DETAIL_BEARER` token to `GET /api/health`, THEN the system SHALL return the full `checks` object including database connectivity, environment variable presence, and binding status.

3.3 WHEN `GET /api/health` is called without any authorization credential, THEN the system SHALL return `{ status: "healthy" }` without error details, regardless of environment.

3.4 WHEN an admin submits correct credentials to `POST /api/auth/step-up`, THEN the system SHALL re-mint the session cookie with a fresh `step_up_at` timestamp, preserve all other session claims, and return an HTTP success response.

3.5 WHEN `POST /api/admin/permissions` is called with valid UUID values for `user_id` and `site_id`, THEN the system SHALL assign the specified role and return the assignment object.

3.6 WHEN `DELETE /api/admin/permissions` is called with valid UUID values for `user_id` and `site_id`, THEN the system SHALL remove the role assignment and return `{ ok: true }`.

3.7 WHEN the admin JWT is refreshed successfully by `token-refresh.tsx`, THEN the session cookie SHALL be silently renewed with no visible UI change.

3.8 WHEN the admin login form is submitted with both email and password fields populated, THEN the system SHALL send the credentials to `/api/auth/login` and process the response as before.

3.9 WHEN the data-retention cron processes `affiliate_clicks`, THEN the system SHALL continue to use cursor-based batching with `cron_state` checkpointing and `BATCH_SIZE = 5000`.

3.10 WHEN `GET /api/gift-finder` is called with valid parameters, THEN the system SHALL return up to 3 scored product recommendations including all non-sensitive fields (name, slug, price_label, price_amount, price_currency, score, image_url, description, merchant, deal_text).

3.11 WHEN a user subscribes to the newsletter via `POST /api/newsletter`, THEN the system SHALL insert or update the subscriber record and SHALL send a confirmation email via Resend that includes an HTML confirmation link and a `List-Unsubscribe` header.

3.12 WHEN `POST /api/auth/forgot-password` is called for an email that does not correspond to any admin user, THEN the system SHALL return a generic 200 success response with a random delay to prevent email enumeration.

3.13 WHEN `GET /r/[shortcode]` is called with a valid `ref` parameter matching `^[a-z0-9][a-z0-9._-]{0,127}$`, THEN the system SHALL record the click with that `content_slug` value unchanged.

3.14 WHEN `GET /r/[shortcode]` is called without a `ref` parameter, THEN the system SHALL record the click with an empty `content_slug`.

3.15 WHEN `lib/sanitize-html.ts` sanitizes HTML content up to `MAX_INPUT_LENGTH` characters, THEN the system SHALL apply the existing tag/attribute allowlist, URL scheme validation, nesting-depth limit, and text-node escaping — the added documentation comments SHALL NOT alter runtime behavior.

3.16 WHEN the admin dashboard renders with an active site that has a non-English `lang` value, THEN the system SHALL apply the site's CSS variables (theme colors) via `active.cssVars` for visual styling purposes.

3.17 WHEN the admin dashboard renders with no active site, THEN the system SHALL render the admin shell with `lang="en"` and default styling.

---

## Bug Condition Derivation

The following pseudocode formalizes the bug conditions and correctness properties for the most structurally significant issues, to guide property-based testing.

**Issue 1 — Fix Checking: OTP must not appear in any URL in the email body**

```pascal
FUNCTION isBugCondition_Issue1(emailHtml, code)
  INPUT: emailHtml as string, code as string
  OUTPUT: boolean
  RETURN emailHtml CONTAINS ("?code=" + code) OR emailHtml CONTAINS ("&code=" + code)
END FUNCTION

FOR ALL (emailHtml, code) WHERE NOT isBugCondition_Issue1(emailHtml, code) DO
  ASSERT emailHtml CONTAINS (code) AS non-linked text
  ASSERT NOT (emailHtml CONTAINS any URL with code as query param value)
END FOR
```

**Issue 4 — Fix Checking: UUID validation must gate DAL calls**

```pascal
FUNCTION isBugCondition_Issue4(user_id, site_id)
  INPUT: user_id as string, site_id as string
  OUTPUT: boolean
  RETURN NOT isUsableUuid(user_id) OR NOT isUsableUuid(site_id)
END FUNCTION

FOR ALL (user_id, site_id) WHERE isBugCondition_Issue4(user_id, site_id) DO
  result ← POST /api/admin/permissions({ user_id, site_id, role_name })
  ASSERT result.status = 400
  ASSERT result.body.error IDENTIFIES the invalid field
END FOR

// Preservation Checking
FOR ALL (user_id, site_id) WHERE NOT isBugCondition_Issue4(user_id, site_id) DO
  ASSERT behavior(user_id, site_id) = original_behavior(user_id, site_id)
END FOR
```

**Issue 13 — Fix Checking: second request must not overwrite a valid token**

```pascal
FUNCTION isBugCondition_Issue13(existingTokenExpiry, now)
  INPUT: existingTokenExpiry as DateTime, now as DateTime
  OUTPUT: boolean
  RETURN existingTokenExpiry > now  // unexpired token already exists
END FUNCTION

FOR ALL (existingTokenExpiry, now) WHERE isBugCondition_Issue13(existingTokenExpiry, now) DO
  tokenBefore ← admin_users.reset_token
  POST /api/auth/forgot-password({ email })
  tokenAfter ← admin_users.reset_token
  ASSERT tokenAfter = tokenBefore  // token must not be overwritten
  ASSERT no email was sent
END FOR

// Preservation Checking
FOR ALL (existingTokenExpiry, now) WHERE NOT isBugCondition_Issue13(existingTokenExpiry, now) DO
  ASSERT new reset token IS generated AND stored AND email IS sent
END FOR
```
