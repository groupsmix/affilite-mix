import { NextRequest, NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { parseJsonBody } from "@/lib/api-error";
import { assertRole } from "@/lib/admin-guard";
import { listDlqEntries, resolveDlqEntry } from "@/lib/dal/webhook-dlq";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { logger } from "@/lib/logger";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/webhook-dlq — List DLQ entries (super_admin only).
 *
 * Query params:
 *   ?status=pending|replayed|resolved  — filter by status (default: pending)
 *   ?limit=50                          — max rows (default 50, max 200)
 */
export const GET = withAuthz(
  "settings",
  "view",
  async (_request: NextRequest, { siteId, session }) => {
    const rlResponse = await enforceAdminRateLimit("webhook-dlq", session);
    if (rlResponse) return rlResponse;

    const roleErr = assertRole(session, "super_admin");
    if (roleErr) return roleErr;

    try {
      const url = new URL(_request.url);
      const status = url.searchParams.get("status") ?? "pending";
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 200);

      if (!["pending", "replayed", "resolved"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }

      const data = await listDlqEntries(status as "pending" | "replayed" | "resolved", limit);

      return NextResponse.json({ data, count: data.length });
    } catch (err) {
      captureException(err);
      logger.error("Failed to list DLQ entries", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

/**
 * PATCH /api/admin/webhook-dlq — Resolve a DLQ entry (super_admin only).
 *
 * Body: { eventId: string }
 */
export const PATCH = withAuthz(
  "settings",
  "manage",
  async (request: NextRequest, { siteId, session }) => {
    const rlResponse = await enforceAdminRateLimit("webhook-dlq", session);
    if (rlResponse) return rlResponse;

    const roleErr = assertRole(session, "super_admin");
    if (roleErr) return roleErr;

    try {
      const bodyOrError = await parseJsonBody(request);
      if (bodyOrError instanceof NextResponse) return bodyOrError;
      const body = bodyOrError as { eventId?: string };
      if (!body.eventId || typeof body.eventId !== "string") {
        return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      }

      await resolveDlqEntry(body.eventId);

      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "unknown",
        actor_user_id: session.userId,
        action: "webhook_dlq.resolve",
        entity_type: "webhook_dlq",
        entity_id: body.eventId,
      });

      return NextResponse.json({ resolved: true, eventId: body.eventId });
    } catch (err) {
      captureException(err);
      return NextResponse.json({ error: "Failed to resolve DLQ entry" }, { status: 500 });
    }
  },
);
