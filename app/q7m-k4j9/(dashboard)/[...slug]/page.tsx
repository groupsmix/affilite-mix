import { notFound } from "next/navigation";

/**
 * Catch-all admin segment (F-006, Req 2.13).
 *
 * In the Next.js App Router an unmatched URL only renders a `not-found.tsx`
 * boundary when a route actually calls `notFound()`; an undefined sub-path
 * otherwise falls through to the PUBLIC root 404. This catch-all matches any
 * unknown `/q7m-k4j9/*` sub-path (real routes are more specific and always win
 * the match) and immediately calls `notFound()`, which renders the nearest
 * boundary — the admin-styled `app/q7m-k4j9/(dashboard)/not-found.tsx` inside
 * the admin shell — instead of the public 404.
 *
 * Known admin routes are unaffected: Next.js prefers concrete segments over the
 * catch-all, so this only runs for genuinely unmatched admin sub-paths.
 */
export default function AdminCatchAll(): never {
  notFound();
}
