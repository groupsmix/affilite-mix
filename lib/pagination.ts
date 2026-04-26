import { NextResponse } from "next/server";

/**
 * Bounded pagination parsing.
 *
 * Accepts the standard `?limit=&offset=` query-string pattern and clamps
 * the result into the supported window. Returns either the clamped
 * `{ limit, offset }` pair OR a 400 NextResponse if the input is non-
 * finite / negative / non-numeric — call sites can `if (parsed instanceof
 * NextResponse) return parsed;` and treat the rest as data.
 *
 * Audit-driven (#22): the previous routes did
 *
 *     const limit = parseInt(searchParams.get("limit") ?? "50", 10);
 *
 * which silently coerced `"1e9"` → `Infinity` → `1000000000` and was
 * later passed straight into PostgREST `.range()`. That blew up DB
 * latency on a single admin request. This helper enforces a hard cap
 * AND a sane minimum so the slow path isn't reachable.
 */
export interface PaginationOptions {
  /** Default `limit` if the param is missing. */
  defaultLimit?: number;
  /** Hard upper bound for `limit`. */
  maxLimit?: number;
  /** Hard upper bound for `offset` (defaults to 100k). */
  maxOffset?: number;
}

export interface ParsedPagination {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_LIMIT = 100;
const DEFAULT_MAX_OFFSET = 100_000;

/**
 * Parse + clamp `limit` / `offset`. Returns a 400 response on garbage
 * input.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  options: PaginationOptions = {},
): ParsedPagination | NextResponse {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
  const maxOffset = options.maxOffset ?? DEFAULT_MAX_OFFSET;

  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");

  const limit = rawLimit === null ? defaultLimit : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);

  if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
    return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
  }
  if (Number.isInteger(limit) === false || Number.isInteger(offset) === false) {
    return NextResponse.json({ error: "Pagination parameters must be integers" }, { status: 400 });
  }
  if (offset < 0 || offset > maxOffset) {
    return NextResponse.json({ error: "offset out of range" }, { status: 400 });
  }

  return {
    limit: Math.min(Math.max(limit, 1), maxLimit),
    offset,
  };
}
