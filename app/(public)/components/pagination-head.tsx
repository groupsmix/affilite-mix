/**
 * Renders <link rel="prev"> / <link rel="next"> tags for paginated pages.
 * Helps search engine crawlers discover paginated content.
 */
export function PaginationHead({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const prevUrl =
    currentPage > 1 ? `${basePath}${currentPage === 2 ? "" : `?page=${currentPage - 1}`}` : null;
  const nextUrl = currentPage < totalPages ? `${basePath}?page=${currentPage + 1}` : null;

  return (
    <>
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}
    </>
  );
}
