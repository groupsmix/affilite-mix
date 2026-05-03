/**
 * F-A99-05: Streaming body-size enforcement for route handlers.
 *
 * The middleware `Content-Length` check only catches honest clients that
 * declare their payload size upfront. Attackers using chunked
 * transfer-encoding (or simply omitting `Content-Length`) bypass the
 * middleware guard entirely. Route handlers that parse a request body
 * must call `readBodyWithLimit` instead of `request.json()` /
 * `request.text()` to enforce an actual byte cap on the stream.
 *
 * Usage:
 *   const body = await readBodyWithLimit(request, 1_048_576); // 1 MB
 *   const data = JSON.parse(body);
 */

/** Default cap when callers don't specify one (1 MB). */
export const DEFAULT_BODY_LIMIT = 1 * 1024 * 1024;

/**
 * Error thrown when the incoming request body exceeds the byte limit.
 * Route handlers can catch this to return a 413 response.
 */
export class BodyTooLargeError extends Error {
  public readonly code = "PAYLOAD_TOO_LARGE" as const;
  public readonly limit: number;

  constructor(limit: number) {
    super(`Request body exceeds the ${limit} byte limit`);
    this.name = "BodyTooLargeError";
    this.limit = limit;
  }
}

/**
 * Read the full request body while enforcing a byte-level cap.
 *
 * Works regardless of whether the client sends `Content-Length` or uses
 * chunked transfer-encoding. The stream is consumed incrementally so we
 * never buffer more than `maxBytes + 1 chunk` in memory before bailing.
 *
 * @throws {BodyTooLargeError} when the accumulated bytes exceed `maxBytes`.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number = DEFAULT_BODY_LIMIT,
): Promise<string> {
  // Fast path: if Content-Length is declared and over the limit, reject
  // immediately without consuming any stream bytes.
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = parseInt(declaredLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new BodyTooLargeError(maxBytes);
    }
  }

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate chunks and decode as UTF-8
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(combined);
}

/**
 * Convenience wrapper: read body with limit and parse as JSON.
 *
 * @throws {BodyTooLargeError} when the body exceeds `maxBytes`.
 * @throws {SyntaxError} when the body is not valid JSON.
 */
export async function readJsonWithLimit<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_BODY_LIMIT,
): Promise<T> {
  const text = await readBodyWithLimit(request, maxBytes);
  return JSON.parse(text) as T;
}
