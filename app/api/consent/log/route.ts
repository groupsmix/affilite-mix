import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-error";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";
import crypto from "crypto";

/**
 * POST /api/consent/log
 * OF-04: Server-side consent proof logging.
 *
 * Called by the CMP (cookie-consent-cmp.tsx) on every consent decision.
 * Persists an immutable row to consent_log so we have server-side proof
 * of what categories the user accepted, at what time, and under which
 * banner version.
 */

function truncateIp(ip: string): string {
  // IPv4: zero last octet; IPv6: zero last 80 bits (keep /48)
  if (ip.includes(".")) {
    return ip.replace(/\.[^.]+$/, ".0");
  }
  // IPv6 — keep first 3 groups only
  const parts = ip.split(":");
  return parts.slice(0, 3).concat(["0", "0", "0", "0", "0"]).join(":");
}

function hashUa(ua: string): string {
  return crypto.createHash("sha256").update(ua).digest("hex").substring(0, 16);
}

export async function POST(request: NextRequest) {
  let body: {
    categories?: string[];
    banner_version?: string;
    subject_id?: string;
    gpc?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON");
  }

  if (!body.categories || !Array.isArray(body.categories)) {
    return apiError(400, "categories is required");
  }
  if (!body.banner_version || typeof body.banner_version !== "string") {
    return apiError(400, "banner_version is required");
  }

  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const sb = await getTenantClient();
    const { error } = await (sb.from as any)("consent_log").insert({
      site_id: siteId,
      subject_id: body.subject_id ?? null,
      categories: body.categories,
      banner_version: body.banner_version,
      gpc: body.gpc ?? false,
      ua_hash: hashUa(ua),
      ip_truncated: truncateIp(ip),
    });

    if (error) {
      captureException(error, { context: "[api/consent/log] insert failed" });
      return apiError(500, "Failed to record consent");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/consent/log] error" });
    return apiError(500, "Failed to record consent");
  }
}
