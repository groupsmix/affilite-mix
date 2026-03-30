/**
 * Generic loading skeleton that works across all homepage templates
 * (standard, cinematic, minimal). Uses a content-agnostic layout
 * to avoid jarring visual transitions when the actual page loads.
 */
export default function PublicHomeLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 animate-pulse">
      {/* Generic heading skeleton */}
      <div className="mb-10 text-center">
        <div className="mx-auto mb-3 h-9 w-56 rounded bg-gray-200" />
        <div className="mx-auto h-4 w-80 max-w-full rounded bg-gray-200" />
      </div>

      {/* Generic content grid skeleton */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="mb-3 h-36 w-full rounded bg-gray-200" />
            <div className="mb-2 h-5 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
