import Link from "next/link";

/**
 * Admin-styled not-found for the `(dashboard)` route group (F-006, Req 2.13).
 *
 * Unknown `/q7m-k4j9/*` sub-paths used to fall through to the PUBLIC root 404
 * because the only admin not-found lived at `app/q7m-k4j9/not-found.tsx`, which
 * does not trigger for unmatched sub-paths inside this nested route group.
 * Placing a `not-found.tsx` here — paired with the `[...slug]` catch-all segment
 * that calls `notFound()` — guarantees unmatched admin sub-paths render this
 * admin-styled page (inside the admin shell/layout) instead of the public 404.
 */
export default function AdminDashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="mt-4 text-lg font-medium text-gray-700 dark:text-gray-300">Page not found</p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        The admin page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/q7m-k4j9"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        Back to Dashboard
      </Link>
    </div>
  );
}
