export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 animate-pulse">
      {/* Breadcrumbs skeleton */}
      <div className="mb-4 flex gap-2">
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-4 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-200" />
      </div>

      {/* Search header skeleton */}
      <header className="mb-8">
        <div className="mb-4 h-9 w-32 rounded bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-lg border border-gray-200 bg-gray-100" />
          <div className="h-10 w-24 rounded-lg bg-gray-200" />
        </div>
      </header>

      {/* Results skeleton */}
      <section className="mb-12">
        <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    </div>
  );
}
