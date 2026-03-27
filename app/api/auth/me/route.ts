import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const activeSiteSlug = await getActiveSiteSlug();
  const activeSite = activeSiteSlug ? getSiteById(activeSiteSlug) : null;

  return NextResponse.json({
    role: session.role,
    activeSite: activeSite ? { id: activeSite.id, name: activeSite.name } : null,
  });
}
