import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { ACTION_STATES, isActionState } from "@/lib/automation/action-state";
import { listAutomationActionsForSite } from "@/lib/dal/automation-actions";
import { requireHumanAdmin } from "./_shared";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  const { error } = admin;
  if (error) return error;
  const auth = await requireHumanAdmin(request, admin);
  if (auth.response) return auth.response;
  const status = request.nextUrl.searchParams.get("status");
  if (status && !isActionState(status)) {
    return NextResponse.json(
      { error: `status must be one of ${ACTION_STATES.join(", ")}` },
      { status: 400 },
    );
  }
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const rawOffset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0;
  try {
    const actions = await listAutomationActionsForSite(auth.dbSiteId, {
      status: status && isActionState(status) ? status : undefined,
      limit,
      offset,
    });
    return NextResponse.json({
      actions,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: Math.min(Math.max(offset, 0), 100_000),
    });
  } catch {
    return NextResponse.json({ error: "Failed to list automation actions" }, { status: 500 });
  }
}
