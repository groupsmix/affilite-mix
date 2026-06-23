# Requirements Document

## Introduction

This feature establishes regression coverage and verification for a set of fixes that have already been applied to the AffiliteMix codebase. The codebase is a Next.js (React 19) application deployed on Cloudflare, backed by Supabase, with Playwright driving end-to-end (E2E) tests.

The fixes fall into two groups:

- **Group A** — corrections to the admin-login E2E test suite that were producing false failures or false passes.
- **Group B** — application bug fixes spanning analytics correctness, error surfacing, dead-code removal, and hydration stability.

The purpose of this spec is not to re-implement the fixes, but to document, for each fix, the behavior it must guarantee and the automated verification that confirms the guarantee holds and protects it against regression. Where a behavior varies meaningfully with input and is cheap to exercise, verification is expressed as a property suitable for property-based testing. Where behavior is fixed or depends on external services, verification is expressed as a representative example or integration check.

Each requirement is scoped to a single fix so that a regression in any one fix maps to exactly one failing requirement.

## Glossary

- **Verification_Suite**: The collection of automated tests (E2E, integration, unit, and property-based) maintained by this spec to confirm each documented fix holds.
- **Admin_Login_E2E**: The Playwright test files that exercise the obfuscated admin login flow.
- **Login_Page**: The Next.js page component rendered at the obfuscated admin login path.
- **Obfuscated_Admin_Path**: The non-obvious admin route segment `/q7m-k4j9/`, used in place of a literal `/admin/` path.
- **Test_Config**: The Playwright configuration that controls browser context options such as CSP bypass and navigation waits.
- **JWT_Audience**: The `aud` claim value a server-issued or test-issued JSON Web Token must carry to be accepted; the server expects `affilite-mix-admin`.
- **EPC**: Earnings Per Click, computed as commission earnings divided by click count.
- **Link_Group**: The set of affiliate links sharing the same `(site_id, product_id, network)` tuple.
- **Domain_Performance**: The aggregated per-domain performance rollup produced by `getDomainPerformance`.
- **DalClientGetter**: A dependency-injected function that returns a Supabase client for data-access-layer queries.
- **AOV**: Average Order Value, computed as total sale amount divided by order count over a period.
- **Privileged_Client**: The Supabase client returned by `getPrivilegedSupabaseClient`, used for server-side privileged queries.
- **Allowlist**: A registry of functions or routes permitted by a security control; `SEC-03` enforces a cap on allowlist entries.
- **Page_Reorder**: The admin operation that moves a page up or down via `handleMoveUp` / `handleMoveDown`.
- **Error_Banner**: A top-level UI element that displays an operation error message to the admin user.
- **Hydration**: The React process of attaching interactivity to server-rendered markup on the client.
- **Mounted_Guard**: A client-side flag that defers rendering of time-dependent output until after the component has mounted, preventing server/client markup mismatches.

## Requirements

### Requirement 1: Login page title assertion tolerates dev-mode suffix

**User Story:** As a QA engineer, I want the login title assertion to match the dev-mode rendering, so that the admin login E2E test does not fail falsely in development builds.

#### Acceptance Criteria

1. WHEN the Login_Page renders the title element with visible text equal to "Admin Login DEV", THE Admin_Login_E2E SHALL evaluate the title assertion as passed.
2. WHEN the Login_Page renders the title element with visible text equal to "Admin Login", THE Admin_Login_E2E SHALL evaluate the title assertion as passed.
3. THE Admin_Login_E2E SHALL evaluate the title assertion by checking that the rendered title text contains the case-sensitive substring "Admin Login", rather than performing an exact-match comparison.
4. WHEN performing the title assertion, THE Admin_Login_E2E SHALL wait up to 5000 milliseconds for the title element to become visible before evaluating the assertion.
5. IF the title element is not visible within 5000 milliseconds, OR IF the rendered title text does not contain the substring "Admin Login", THEN THE Admin_Login_E2E SHALL evaluate the title assertion as failed and report an assertion failure indicating the expected substring and the actual rendered title text.

### Requirement 2: Test JWT audience matches server expectation

**User Story:** As a QA engineer, I want test-issued JWTs to use the audience the server expects, so that authenticated login flows are validated instead of rejected.

#### Acceptance Criteria

1. THE Admin_Login_E2E SHALL set the JWT_Audience (`aud`) claim to exactly "affilite-mix-admin" in every test file that issues a token for the admin login flow.
2. WHEN a test-issued JWT carries an audience (`aud`) claim equal to exactly "affilite-mix-admin", THE server SHALL accept the token and proceed with the admin login flow.
3. IF a JWT carries an audience (`aud`) claim with any value other than "affilite-mix-admin", THEN THE server SHALL reject the token without establishing an authenticated session and return a response indicating authentication failure.
4. IF a JWT omits the audience (`aud`) claim or carries an empty audience claim, THEN THE server SHALL reject the token without establishing an authenticated session and return a response indicating authentication failure.

### Requirement 3: CSP bypass and hydration signal enable interaction in tests

**User Story:** As a QA engineer, I want the test browser context to permit webpack eval and the login page to expose a hydration signal, so that React 19 hydrates and user clicks are handled.

#### Acceptance Criteria

1. THE Test_Config SHALL enable Content Security Policy bypass for the browser context used by Admin_Login_E2E.
2. WHEN the Login_Page completes Hydration, THE Login_Page SHALL expose a hydration-complete signal that remains observable by Admin_Login_E2E for the duration of the page session.
3. WHEN Hydration is complete and a user clicks a Login_Page control, THE Login_Page SHALL invoke the control's associated action rather than ignoring the click.
4. WHEN Admin_Login_E2E is about to interact with the first Login_Page control, THE Admin_Login_E2E SHALL wait up to 30000 milliseconds for the hydration-complete signal before interacting.
5. IF the hydration-complete signal is not observable within 30000 milliseconds, THEN THE Admin_Login_E2E SHALL fail with an error indicating Hydration did not complete and SHALL NOT issue an interaction.

### Requirement 4: Dialog selector is scoped by accessible name

**User Story:** As a QA engineer, I want the reset-password dialog to be selected by its accessible name, so that the test does not match the cookie consent banner.

#### Acceptance Criteria

1. THE Admin_Login_E2E SHALL select the reset-password dialog by ARIA role "dialog" scoped to the exact, case-sensitive accessible name "Reset Password".
2. WHEN both the reset-password dialog and the cookie consent banner are present in the DOM, THE Admin_Login_E2E SHALL resolve the dialog selector to exactly one element that is the reset-password dialog.
3. IF the dialog selector resolves to zero matching elements within 5 seconds, THEN THE Admin_Login_E2E SHALL fail the test with an error indicating the reset-password dialog was not found, and SHALL not interact with any other dialog or banner element.
4. IF the dialog selector resolves to more than one matching element, THEN THE Admin_Login_E2E SHALL fail the test with an error indicating the dialog selector matched multiple elements.

### Requirement 5: Post-login navigation waits on commit for streamed dashboard

**User Story:** As a QA engineer, I want post-login navigation to wait on commit, so that the test does not time out waiting for a streaming dashboard to fully load.

#### Acceptance Criteria

1. WHEN Admin_Login_E2E awaits the post-login URL after a successful login submission, THE Admin_Login_E2E SHALL use the navigation wait condition "commit" rather than "load" or "networkidle".
2. WHEN the dashboard response streams incrementally and the navigation has committed, THE Admin_Login_E2E SHALL resolve the post-login URL wait within 10 seconds without waiting for the streamed body to finish loading.
3. WHEN Admin_Login_E2E evaluates the committed post-login URL, THE Admin_Login_E2E SHALL treat the wait as satisfied only if the URL matches the expected dashboard path pattern.
4. IF the committed post-login URL does not match the expected dashboard path pattern within 10 seconds, THEN THE Admin_Login_E2E SHALL fail the test with an error indicating the post-login navigation did not reach the dashboard.

### Requirement 6: Login-page detection matches the obfuscated admin path

**User Story:** As a QA engineer, I want the login-page detection to match the obfuscated admin path, so that the helper correctly identifies the login page.

#### Acceptance Criteria

1. WHEN a URL string contains the Obfuscated_Admin_Path login segment "/q7m-k4j9/login" as a case-sensitive substring, THE `isLoginPage` helper SHALL return the boolean value true.
2. WHEN a URL string contains "/admin/login" but does not contain the Obfuscated_Admin_Path login segment "/q7m-k4j9/login", THE `isLoginPage` helper SHALL return the boolean value false.
3. WHEN a URL string does not contain the Obfuscated_Admin_Path login segment "/q7m-k4j9/login", THE `isLoginPage` helper SHALL return the boolean value false.
4. IF the input is null, undefined, an empty string, or not a string, THEN THE `isLoginPage` helper SHALL return the boolean value false without throwing an error.

### Requirement 7: Navigation avoids networkidle with stubbed Supabase

**User Story:** As a QA engineer, I want navigation waits to avoid networkidle when Supabase is stubbed, so that endless circuit-breaker retries do not hang the test.

#### Acceptance Criteria

1. WHEN Admin_Login_E2E navigates with a stubbed Supabase backend, THE Admin_Login_E2E SHALL use the navigation wait condition "domcontentloaded" with a navigation timeout of 30 seconds (30000 ms).
2. WHEN navigation completes with wait condition "domcontentloaded", THE Admin_Login_E2E SHALL perform a URL check within 5 seconds (5000 ms) that compares the current page URL against the expected destination URL, rather than awaiting network idle.
3. WHILE a stubbed Supabase backend retries via its circuit breaker, THE Admin_Login_E2E SHALL NOT block on network idle.
4. IF navigation does not reach the "domcontentloaded" condition within the 30-second (30000 ms) timeout, THEN THE Admin_Login_E2E SHALL terminate the navigation wait and report an error indicating a navigation timeout, without retaining a partial navigation state.
5. IF the URL check does not match the expected destination URL within 5 seconds (5000 ms), THEN THE Admin_Login_E2E SHALL fail the navigation step and report an error indicating the URL mismatch.

### Requirement 8: Disabled menu item hover bypasses tooltip interception

**User Story:** As a QA engineer, I want hover on a disabled menu item to be forced, so that the Radix tooltip trigger does not intercept the pointer event.

#### Acceptance Criteria

1. WHEN Admin_Login_E2E hovers a disabled menu item whose Radix TooltipTrigger overlays the pointer target, THE Admin_Login_E2E SHALL perform the hover with the force option enabled, bypassing actionability (visibility, enabled, and stability) checks.
2. WHEN the hover is performed with the force option enabled, THE Admin_Login_E2E SHALL complete the hover within 5 seconds without raising a pointer interception error.
3. IF the hover does not complete within 5 seconds, THEN THE Admin_Login_E2E SHALL fail the test step with an error indicating the hover could not be performed on the disabled menu item, and SHALL not mark the test as passed.

### Requirement 9: EPC computed per link group without click inflation

**User Story:** As an analytics consumer, I want EPC computed once per link group, so that multi-link products do not inflate click counts or distort EPC.

#### Acceptance Criteria

1. WHEN clicks are aggregated for a product with multiple links, THE analytics aggregator SHALL assign each matching link to exactly one Link_Group keyed by the tuple (site_id, product_id, network).
2. WHEN counting clicks for a Link_Group, THE analytics aggregator SHALL count a click that matches any URL in the group as incrementing the group total by exactly 1, so that a click is never counted more than once.
3. WHEN aggregating a Link_Group during an aggregation run, THE analytics aggregator SHALL perform exactly one upsert for that Link_Group per run.
4. WHEN the deduplicated click total for a Link_Group is computed, THE analytics aggregator SHALL store the Link_Group's click count as that deduplicated total.
5. WHILE a Link_Group has a total click count greater than zero, THE analytics aggregator SHALL compute EPC as commission earnings divided by the total clicks of the group, rounded to 2 decimal places using round-half-up.
6. IF a Link_Group has zero total clicks, THEN THE analytics aggregator SHALL store EPC as 0 without raising a division error.
7. IF commission earnings for a Link_Group are missing or undefined, THEN THE analytics aggregator SHALL treat the earnings as 0 when computing EPC.

### Requirement 10: Domain rollup uses an injected privileged client

**User Story:** As an analytics consumer, I want the domain rollup to query through a privileged client, so that Domain_Performance returns real values instead of all zeros.

#### Acceptance Criteria

1. THE `getDomainPerformance` function SHALL accept a DalClientGetter parameter.
2. WHEN the domain-performance route invokes `getDomainPerformance`, THE route SHALL pass `getPrivilegedSupabaseClient` as the DalClientGetter.
3. WHEN `getDomainPerformance` executes with the Privileged_Client and at least one underlying performance record exists, THE `getDomainPerformance` function SHALL return Domain_Performance values that reflect the underlying performance records and are not all zero.
4. THE Allowlist SHALL include `getDomainPerformance` and the domain-performance route in both required allowlists.
5. THE `SEC-03` allowlist cap SHALL be 39. (Reconciled with the live regression lock in `__tests__/audit3-locks.test.ts`: the cap of 38 reflected the count immediately after the B-F2 domain-performance addition that R10 verifies; the audited count has since legitimately grown to 39 with the addition of the audit-log writer `lib/audit-log.ts`, which is outside this spec's scope.)
6. WHEN the Allowlist contains 39 or fewer entries, THE `SEC-03` control SHALL pass.
7. IF the Allowlist contains more than 39 entries, THEN THE `SEC-03` control SHALL fail.
8. WHEN `getDomainPerformance` executes with the Privileged_Client and no underlying performance records exist, THE `getDomainPerformance` function SHALL return Domain_Performance values of zero.
9. IF the DalClientGetter does not return a usable Privileged_Client when `getDomainPerformance` is invoked, THEN THE `getDomainPerformance` function SHALL return an error indicating client retrieval failure and SHALL NOT return Domain_Performance values.

### Requirement 11: Average order value derived from real commissions

**User Story:** As an analytics consumer, I want AOV computed from real commission data, so that the reported value is not a tautology.

#### Acceptance Criteria

1. WHEN AOV is computed for a period defined by a start timestamp (inclusive) and an end timestamp (exclusive), THE analytics aggregator SHALL query all commissions whose sale timestamps fall within that period.
2. IF the order count for the period is greater than zero, THEN THE analytics aggregator SHALL compute AOV as the sum of sale amounts divided by the order count, rounded to 2 decimal places.
3. IF the commissions query fails, THEN THE analytics aggregator SHALL return AOV as 0 and include an indication that the value reflects a query failure rather than a computed result, with no partial results retained.
4. IF the order count for the period is zero, THEN THE analytics aggregator SHALL return AOV as 0 and include an indication that the value reflects an empty period rather than a query failure.

### Requirement 12: Dead response-HMAC control removed

**User Story:** As a security maintainer, I want the unused response-HMAC code removed, so that the codebase no longer carries a control that provided false assurance.

#### Acceptance Criteria

1. THE codebase SHALL NOT define a `computeResponseHmac` function in any source file.
2. WHERE a crypto import existed solely to support response-HMAC computation, THE codebase SHALL NOT retain that import; THE codebase SHALL retain any crypto import that is still referenced by at least one other in-use code path.
3. THE codebase SHALL NOT reference `response_hmac` in any source file, including each of the three previously affected usages.
4. WHEN the project is compiled or built after the removal, THE build SHALL complete without errors or unresolved-reference failures attributable to `computeResponseHmac` or `response_hmac`.
5. WHEN a response is generated after the removal, THE system SHALL produce the same response output as before, differing only by the absence of the response-HMAC value, with no error raised due to the missing function or field.

### Requirement 13: Page reorder surfaces failures

**User Story:** As an admin user, I want a failed page reorder to be reported, so that I am not misled by a silent success.

#### Acceptance Criteria

1. IF a Page_Reorder request returns a non-OK response, THEN THE admin page editor SHALL set an error message via `setError` indicating that the new page order could not be saved.
2. WHEN a Page_Reorder request returns an OK response, THE admin page editor SHALL reload the page list via `loadPages`.
3. WHILE the page form is closed and a Page_Reorder error is present, THE admin page editor SHALL display the Error_Banner.
4. WHEN a Page_Reorder optimistic update fails, THE admin page editor SHALL reload the page list via `loadPages` to restore the previously persisted order.
5. IF a Page_Reorder request fails without returning a response (network or connection error), THEN THE admin page editor SHALL set an error message via `setError` indicating the reorder could not be completed and SHALL restore the previously persisted order.
6. WHILE a Page_Reorder request is in flight, THE admin page editor SHALL ignore additional reorder requests until the in-flight request resolves.
7. WHEN the targeted page is already first and a move-up is requested, or already last and a move-down is requested, THE admin page editor SHALL take no reorder action.

### Requirement 14: AI-content delete surfaces non-OK responses

**User Story:** As an admin user, I want a failed AI-content delete to be reported, so that I know the item was not removed.

#### Acceptance Criteria

1. IF an AI-content delete request returns a non-OK response (response `ok` field is false), THEN THE AI-content admin handler SHALL extract the server-provided error message and set it via `setError` within 5 seconds of receiving the response, while leaving the target item present in the displayed list.
2. WHEN an AI-content delete request returns an OK response (response `ok` field is true), THE AI-content admin handler SHALL treat the delete as successful and clear any previously set error via `setError`.
3. THE AI-content delete handler SHALL capture the response and check its `ok` field before treating the operation as successful.
4. IF a non-OK response contains no extractable server error message (the error field is absent or an empty string), THEN THE AI-content admin handler SHALL set a default error message via `setError` indicating that the deletion failed.
5. IF an AI-content delete request fails to return a response (network failure or no response received within 30 seconds), THEN THE AI-content admin handler SHALL set an error message via `setError` indicating the deletion could not be completed and SHALL NOT treat the delete as successful.

### Requirement 15: Affiliate-network delete surfaces non-OK responses

**User Story:** As an admin user, I want a failed affiliate-network delete to be reported, so that I know the item was not removed.

#### Acceptance Criteria

1. WHEN an affiliate-network delete request returns a non-OK response and the response body contains a server error message, THE affiliate-network admin handler SHALL extract that message and set it via `setError`, and SHALL retain the affiliate-network item in the displayed list.
2. WHEN an affiliate-network delete request returns an OK response, THE affiliate-network admin handler SHALL clear any existing error via `setError`, treat the delete as successful, and remove the affiliate-network item from the displayed list.
3. THE affiliate-network delete handler SHALL capture the response and check its `ok` field before treating the operation as successful.
4. IF an affiliate-network delete request returns a non-OK response whose body contains no parseable server error message, THEN THE affiliate-network admin handler SHALL set a generic delete-failure error message via `setError` and SHALL retain the affiliate-network item in the displayed list.
5. IF an affiliate-network delete request fails to complete without returning a response, THEN THE affiliate-network admin handler SHALL set an error message indicating the delete could not be completed via `setError` and SHALL retain the affiliate-network item in the displayed list.

### Requirement 16: Hydration-stable time rendering in product and content cards

**User Story:** As a site visitor, I want time-dependent card output to render consistently between server and client, so that no hydration mismatch occurs.

#### Acceptance Criteria

1. WHILE the product-card component is not yet mounted on the client, THE product-card SHALL NOT render the deal badge or any deal-badge time calculation, deferring it behind a Mounted_Guard.
2. WHEN the content-card formats a date, THE content-card SHALL render the date using the time zone "UTC" and the locale "en-US".
3. WHEN the product-card and content-card render on the server and then hydrate on the client, THE components SHALL produce byte-identical markup for the time-dependent output with no React hydration mismatch warning.
4. WHEN the product-card is mounted on the client and the associated deal is active and unexpired, THE product-card SHALL render the deal badge within 1 second.
5. WHEN the product-card is mounted on the client and the associated deal expiration time has passed, THE product-card SHALL NOT render the deal badge or a remaining-time indicator.
6. WHERE no publication or creation date is available for a content-card, THE content-card SHALL NOT render a time element.
