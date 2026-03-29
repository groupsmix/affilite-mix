export default function ContentDetailLoading() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-8 animate-pulse">
      {/* Breadcrumbs skeleton */}
      <div className="mb-4 flex gap-2">
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-4 rounded bg-gray-100" />
        <div className="h-4 w-24 rounded bg-gray-200" />
        <div className="h-4 w-4 rounded bg-gray-100" />
        <div className="h-4 w-40 rounded bg-gray-200" />
      </div>

      {/* Header skeleton */}
      <header className="mb-8">
        <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
        <div className="mb-3 h-10 w-full rounded bg-gray-200" />
        <div className="mb-2 h-5 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </header>

      {/* Body skeleton */}
      <div className="mb-10 space-y-4">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-11/12 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-2/3 rounded bg-gray-200" />
        <div className="h-8 w-full rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-10/12 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-3/4 rounded bg-gray-200" />
      </div>

      {/* Related products skeleton */}
      <section className="mt-10 border-t border-gray-200 pt-8">
        <div className="mb-6 h-7 w-48 rounded bg-gray-200" />
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
    </article>
  );
}
