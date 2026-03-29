import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  basePath: string;
}

/**
 * Build a truncated list of page numbers with ellipsis gaps.
 * Always shows first, last, and up to 2 pages around the current page.
 * Example: 1 ... 4 5 [6] 7 8 ... 17
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis-start" | "ellipsis-end")[] {
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

export function Pagination({ currentPage, totalItems, pageSize, basePath }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const separator = basePath.includes("?") ? "&" : "?";
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {currentPage > 1 && (
        <Link
          href={currentPage === 2 ? basePath : `${basePath}${separator}page=${currentPage - 1}`}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Previous
        </Link>
      )}
      {pageNumbers.map((item) => {
        if (item === "ellipsis-start" || item === "ellipsis-end") {
          return (
            <span
              key={item}
              className="px-2 py-2 text-sm text-gray-400"
              aria-hidden="true"
            >
              &hellip;
            </span>
          );
        }
        return (
          <Link
            key={item}
            href={item === 1 ? basePath : `${basePath}${separator}page=${item}`}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
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
          href={`${basePath}${separator}page=${currentPage + 1}`}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
