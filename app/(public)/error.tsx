"use client";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h2 className="mb-2 text-2xl font-bold text-gray-900">Something went wrong</h2>
      <p className="mb-6 text-sm text-gray-500">
        {process.env.NODE_ENV === "development"
          ? error.message || "An unexpected error occurred. Please try again."
          : "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Try again
      </button>
    </div>
  );
}
