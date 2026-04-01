import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getPageById, updatePage, deletePage } from "@/lib/dal/pages";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeHtml } from "@/lib/sanitize-html";

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

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/pages/:id  — get a single page
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  try {
    const { id } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/pages/:id  — update a page
 * Body: { slug?, title?, body?, is_published?, sort_order? }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  try {
    const { id } = await params;
    const body = await request.json();
    if (body.body !== undefined) {
      body.body = sanitizeHtml(body.body);
    }
    const page = await updatePage(id, body);
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/pages/:id  — delete a page
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  try {
    const { id } = await params;
    await deletePage(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
