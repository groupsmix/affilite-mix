import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { updateAdminUser } from "@/lib/dal/admin-users";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";

/** PATCH /api/admin/users/me — update own profile (name only) */
export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session || !session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`admin:me:${session.userId}`, {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const name = ((bodyOrError.name as string) ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    await updateAdminUser(session.userId, { name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me] PATCH failed" });
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
