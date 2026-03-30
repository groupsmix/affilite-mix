import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-8xl font-bold text-gray-200">404</h1>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">
          Page not found
        </h2>
        <p className="mt-2 text-gray-500">
          Sorry, we couldn&apos;t find the page you&apos;re looking for.
          It may have been moved or no longer exists.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Go to Homepage
          </Link>
          <Link
            href="/search"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Search
          </Link>
        </div>
      </div>
    </div>
  );
}
