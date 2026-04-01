import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
}

/**
 * Build a truncated list of page numbers with ellipsis gaps.
 * Always shows first, last, and up to 2 pages around the current page.
 * Example: 1 ... 4 5 [6] 7 8 ... 17
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis-start" | "ellipsis-end")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];

  // Always include first page
  pages.push(1);

  const rangeStart = Math.max(2, currentPage - 1);
  const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

  if (rangeStart > 2) {
    pages.push("ellipsis-start");
  }

  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  if (rangeEnd < totalPages - 1) {
    pages.push("ellipsis-end");
  }

  // Always include last page
  pages.push(totalPages);

  return pages;
}

function buildPageUrl(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else {
        params.set(key, value);
      }
    }
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  basePath,
  searchParams,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {currentPage > 1 && (
        <Link
          href={buildPageUrl(basePath, currentPage - 1, searchParams)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          Previous
        </Link>
      )}
      {pageNumbers.map((item) => {
        if (item === "ellipsis-start" || item === "ellipsis-end") {
          return (
            <span key={item} className="px-2 py-2 text-sm text-gray-500" aria-hidden="true">
              &hellip;
            </span>
          );
        }
        return (
          <Link
            key={item}
            href={buildPageUrl(basePath, item, searchParams)}
            aria-current={item === currentPage ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${
              item === currentPage
                ? "bg-gray-900 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {item}
          </Link>
        );
      })}
      {currentPage < totalPages && (
        <Link
          href={buildPageUrl(basePath, currentPage + 1, searchParams)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
