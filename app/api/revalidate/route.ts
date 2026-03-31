import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";

const VALID_TAGS = ["content", "products", "categories"] as const;
type ValidTag = (typeof VALID_TAGS)[number];

/**
 * POST /api/revalidate — On-demand cache revalidation webhook.
 *
 * Call this after admin content changes to propagate updates immediately
 * instead of waiting for the ISR revalidation interval (1 hour).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Body (optional):
 *   { "tags": ["content", "products"] }
 *
 * If no tags are provided, all cacheable tags are revalidated.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tagsToRevalidate: ValidTag[] = [...VALID_TAGS];

  try {
    const body = await request.json();
    if (Array.isArray(body.tags) && body.tags.length > 0) {
      const requested = body.tags.filter((t: unknown): t is ValidTag =>
        typeof t === "string" && VALID_TAGS.includes(t as ValidTag),
      );
      if (requested.length > 0) {
        tagsToRevalidate = requested;
      }
    }
  } catch {
    // No body or invalid JSON — revalidate all tags
  }

  for (const tag of tagsToRevalidate) {
    revalidateTag(tag);
  }

  return NextResponse.json({
    ok: true,
    revalidated: tagsToRevalidate,
    timestamp: new Date().toISOString(),
  });
}
