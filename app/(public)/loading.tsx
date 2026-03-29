export default function PublicHomeLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 animate-pulse">
      {/* Hero skeleton */}
      <section className="mb-12 text-center">
        <div className="mx-auto mb-3 h-10 w-64 rounded bg-gray-200" />
        <div className="mx-auto h-5 w-96 max-w-full rounded bg-gray-200" />
      </section>

      {/* Categories skeleton */}
      <section className="mb-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="h-5 w-32 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </section>

      {/* Featured products skeleton */}
      <section className="mb-12">
        <div className="mb-6 h-7 w-48 rounded bg-gray-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="mb-3 h-40 w-full rounded bg-gray-200" />
              <div className="mb-2 h-5 w-3/4 rounded bg-gray-200" />
              <div className="mb-2 h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      {/* Recent content skeleton */}
      <section className="mb-12">
        <div className="mb-6 h-7 w-40 rounded bg-gray-200" />
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
      </section>
    </div>
  );
}
