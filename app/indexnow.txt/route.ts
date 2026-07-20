import { getIndexNowKey } from "@/lib/bing-indexnow";
import { NextResponse } from "next/server";

/**
 * GET /indexnow.txt — IndexNow key validation file.
 *
 * Participating search engines fetch this file to confirm ownership of the
 * IndexNow key before accepting URL submissions. The file content is the raw
 * key string (no markup).
 *
 * If BING_INDEXNOW_KEY is not configured, the route returns 404.
 */
export function GET(): Response {
  const key = getIndexNowKey();
  if (!key) {
    return new NextResponse("IndexNow key not configured", { status: 404 });
  }

  return new NextResponse(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
