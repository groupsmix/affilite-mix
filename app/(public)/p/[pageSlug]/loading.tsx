export default function PageSlugLoading() {
  return (
    <article
      className="mx-auto max-w-4xl px-4 py-8 animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>

      {/* Breadcrumbs skeleton */}
      <div className="mb-4 flex gap-2">
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-4 rounded bg-gray-100" />
        <div className="h-4 w-32 rounded bg-gray-200" />
      </div>

      {/* Header skeleton */}
      <header className="mb-8">
        <div className="mb-3 h-10 w-full rounded bg-gray-200" />
        <div className="mb-2 h-5 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </header>

      {/* Hero image skeleton */}
      <div className="mb-8 h-64 w-full rounded-lg bg-gray-200" />

      {/* Body skeleton */}
      <div className="space-y-4">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-11/12 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-2/3 rounded bg-gray-200" />
      </div>
    </article>
  );
}
