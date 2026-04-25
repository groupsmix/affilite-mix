export function clampPagination(searchParams: URLSearchParams) {
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 50), 1),
    100
  );
  
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  
  if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
    throw new Error("Invalid pagination");
  }
  
  return { limit, offset };
}
