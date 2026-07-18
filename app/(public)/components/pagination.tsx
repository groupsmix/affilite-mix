import Link from "next/link";

interface PaginationHeadProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  /** Absolute URL base, e.g. "https://example.com/category/watches" */
  baseUrl: string;
}

/**
 * Renders <link rel="prev"> and <link rel="next"> tags in <head>
 * for SEO crawlers to discover paginated pages.
 */
export function PaginationHead({
  currentPage,
  totalItems,
  pageSize,
  baseUrl,
}: PaginationHeadProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const prevUrl =
    currentPage > 1 ? (currentPage === 2 ? baseUrl : `${baseUrl}?page=${currentPage - 1}`) : null;
  const nextUrl = currentPage < totalPages ? `${baseUrl}?page=${currentPage + 1}` : null;

  return (
    <>
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}
    </>
  );
}

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
  /** Language code for i18n (defaults to "en") */
  language?: string;
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
  language = "en",
}: PaginationProps) {
  // Note: For <link rel="prev/next">, use the PaginationHead component
  // in the page's server component with the full absolute URL.
  const isAr = language === "ar";
  const prevLabel = isAr ? "السابق" : "Previous";
  const nextLabel = isAr ? "التالي" : "Next";
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {currentPage > 1 && (
        <Link
          href={buildPageUrl(basePath, currentPage - 1, searchParams)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
        >
          {prevLabel}
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
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all active:scale-[0.98] ${
              item === currentPage
                ? "bg-[color:var(--color-accent,#16A34A)] text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {item}
          </Link>
        );
      })}
      {currentPage < totalPages && (
        <Link
          href={buildPageUrl(basePath, currentPage + 1, searchParams)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
        >
          {nextLabel}
        </Link>
      )}
    </nav>
  );
}
