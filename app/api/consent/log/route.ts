import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { getClientIp } from "@/lib/get-client-ip";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import crypto from "crypto";

/**
 * POST /api/consent/log
 * OF-04: Server-side consent proof logging.
 * Records every CMP consent decision so we can prove lawful basis at audit time.
 */
export async function POST(request: NextRequest) {
  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const { site_id, categories, banner_version, gpc, subject_id } = bodyOrError as {
    site_id?: string;
    categories?: string[];
    banner_version?: string;
    gpc?: boolean;
    subject_id?: string;
  };

  if (!site_id || !categories || !banner_version) {
    return apiError(400, "site_id, categories, and banner_version are required");
  }

  const ip = getClientIp(request);
  const ipTruncated = ip ? ip.split(".").slice(0, 3).join(".") + ".0" : "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  const uaHash = crypto.createHash("sha256").update(ua).digest("hex").substring(0, 16);

  try {
    const sb = await getTenantClient();
    // eslint-disable-next-line no-restricted-syntax -- public insert; no RLS bypass needed
    const { error } = await sb.from("consent_log").insert({
      site_id,
      subject_id: subject_id ?? null,
      categories,
      banner_version,
      gpc: gpc ?? false,
      ua_hash: uaHash,
      ip_truncated: ipTruncated,
    });

    if (error) {
      captureException(error, { context: "[api/consent/log] insert failed" });
      return apiError(500, "Failed to log consent");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/consent/log] unexpected error" });
    return apiError(500, "Internal server error");
  }
}
