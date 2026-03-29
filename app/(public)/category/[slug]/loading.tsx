export default function CategoryLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 animate-pulse">
      {/* Breadcrumbs skeleton */}
      <div className="mb-4 flex gap-2">
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-4 rounded bg-gray-100" />
        <div className="h-4 w-28 rounded bg-gray-200" />
      </div>

      {/* Header skeleton */}
      <header className="mb-8">
        <div className="mb-2 h-9 w-48 rounded bg-gray-200" />
        <div className="h-5 w-80 max-w-full rounded bg-gray-100" />
      </header>

      {/* Products skeleton */}
      <section className="mb-12">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="mb-3 h-40 w-full rounded bg-gray-200" />
              <div className="mb-2 h-5 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      {/* Content grid skeleton */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Pagination skeleton */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-9 rounded bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
