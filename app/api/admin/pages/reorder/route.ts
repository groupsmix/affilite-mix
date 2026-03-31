import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { reorderPages } from "@/lib/dal/pages";
import { checkRateLimit } from "@/lib/rate-limit";

/** 100 admin API requests per minute per user session */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

async function enforceRateLimit(email: string | undefined, userId: string | undefined) {
  const key = `admin:${email ?? userId ?? "unknown"}`;
  const rl = await checkRateLimit(key, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  return null;
}

/**
 * PUT /api/admin/pages/reorder
 * Body: { pages: [{ id, sort_order }] }
 */
export async function PUT(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  try {
    const body = await request.json();

    if (!Array.isArray(body.pages)) {
      return NextResponse.json({ error: "pages array is required" }, { status: 400 });
    }

    await reorderPages(body.pages);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
