import { NextRequest, NextResponse } from "next/server";
import {
  listAffiliateNetworks,
  upsertAffiliateNetwork,
  deleteAffiliateNetwork,
} from "@/lib/dal/affiliate-networks";
import { NETWORK_CONFIGS } from "@/lib/affiliate/networks";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { withAuthz } from "@/lib/authz";

const VALID_NETWORKS = new Set(["cj", "partnerstack", "admitad", "direct"]);

/** GET — List affiliate network configs for the active site */
export const GET = withAuthz("integrations", "view", async (_request, { siteId }) => {
  try {
    const networks = await listAffiliateNetworks(siteId);
    const enriched = networks.map((row) => ({
      ...row,
      meta: NETWORK_CONFIGS[row.network as keyof typeof NETWORK_CONFIGS] ?? null,
    }));

    return NextResponse.json({
      configured: enriched,
      available: Object.values(NETWORK_CONFIGS),
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/affiliate-networks] GET failed:" });
    return NextResponse.json({ error: "Failed to list affiliate networks" }, { status: 500 });
  }
});

/** POST — Create or update an affiliate network config */
export const POST = withAuthz(
  "integrations",
  "configure",
  async (request: NextRequest, { session, siteId }) => {
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;
    const body = rawOrError;

    const network = typeof body.network === "string" ? body.network : "";
    if (!VALID_NETWORKS.has(network)) {
      return NextResponse.json(
        { error: "network must be one of: cj, partnerstack, admitad, direct" },
        { status: 400 },
      );
    }

    const publisherId = typeof body.publisher_id === "string" ? body.publisher_id : "";
    const apiKeyRef = typeof body.api_key_ref === "string" ? body.api_key_ref : "";
    const isActive = typeof body.is_active === "boolean" ? body.is_active : true;
    const config =
      typeof body.config === "object" && body.config !== null && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {};

    try {
      const result = await upsertAffiliateNetwork({
        site_id: siteId,
        network,
        publisher_id: publisherId,
        api_key_ref: apiKeyRef,
        is_active: isActive,
        config,
      });

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "affiliate_network",
        entity_id: result.id,
        details: { network },
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/affiliate-networks] POST failed:" });
      return NextResponse.json({ error: "Failed to save affiliate network" }, { status: 500 });
    }
  },
);

/** DELETE — Remove an affiliate network config */
export const DELETE = withAuthz(
  "integrations",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
    let id: string | null = null;
    try {
      const body = await request.json();
      id = body?.id ?? null;
    } catch {
      // fallback to query params
    }
    if (!id) {
      id = request.nextUrl.searchParams.get("id");
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    try {
      await deleteAffiliateNetwork(siteId, id);

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "delete",
        entity_type: "affiliate_network",
        entity_id: id,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/affiliate-networks] DELETE failed:" });
      return NextResponse.json({ error: "Failed to delete affiliate network" }, { status: 500 });
    }
  },
);
