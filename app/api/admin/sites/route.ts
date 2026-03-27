import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { allSites } from "@/config/sites";

/** GET /api/admin/sites — list all available sites for the admin */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = allSites.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
  }));

  return NextResponse.json({ sites });
}
