/**
 * Shared, dependency-free constants for the step-up re-authentication flow
 * (F-030). This module intentionally imports nothing — keeping it free of any
 * `next/server` (server-only) imports means both server code
 * (`lib/step-up-auth.ts`) and client code (`lib/fetch-csrf.ts`,
 * `lib/step-up-client.tsx`) can share the header name without dragging
 * server-only APIs into the client bundle.
 */

/**
 * Header set on every step-up 403 response (see `lib/step-up-auth.ts`). Clients
 * use it to tell a "re-authentication required" 403 apart from a CSRF/authz 403.
 */
export const STEP_UP_REQUIRED_HEADER_NAME = "x-step-up-required";

/** Endpoint that re-verifies credentials and re-mints the `step_up_at` claim. */
export const STEP_UP_ENDPOINT = "/api/auth/step-up";
