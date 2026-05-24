import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { getTenantClient } from "@/lib/supabase-server";

/**
 * A100-10: Rate-limited consent log endpoint.
 * 5 requests per IP per minute — legitimate consent interactions
 * should never exceed this.
 */
const CONSENT_LOG_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/**
 * POST /api/consent/log
 * Records a user's cookie consent preferences.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`consent-log:${ip}`, CONSENT_LOG_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const bodyOrError = await parseJsonBody(request, { maxBodyBytes: 4096 });
    if (bodyOrError instanceof NextResponse) return bodyOrError;

    const { categories, action } = bodyOrError as {
      categories?: Record<string, boolean>;
      action?: string;
    };

    if (!categories || typeof categories !== "object") {
      return NextResponse.json({ error: "categories is required" }, { status: 400 });
    }

    const siteSlug = request.headers.get("x-site-id");
    if (!siteSlug) {
      return NextResponse.json({ error: "Site could not be resolved" }, { status: 400 });
    }

    const sb = await getTenantClient();
    const { error } = await sb.from("consent_log" as any).insert({
      site_id: siteSlug,
      ip_hash: ip ? await hashIp(ip) : null,
      categories: JSON.stringify(categories),
      action: action || "update",
      created_at: new Date().toISOString(),
    });

    if (error) {
      captureException(error, { context: "[api/consent/log] insert failed" });
      return NextResponse.json({ error: "Failed to log consent" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/consent/log] POST failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Hash IP for privacy-respecting consent logging */
async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "consent-salt-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
