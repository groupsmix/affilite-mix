"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/report-error";

export default function ProductsFormError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "products-form", digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <h2 className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">
        Failed to load products form
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong loading this page."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800"
        >
          Retry
        </button>
        <Link
          href="/q7m-k4j9/products"
          className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50"
        >
          Back to products
        </Link>
      </div>
    </div>
  );
}
