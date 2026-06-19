import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { getClientIp } from "@/lib/get-client-ip";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getProductById } from "@/lib/dal/products";
import {
  createPriceAlert,
  getPriceAlert,
  deactivatePriceAlertScoped,
} from "@/lib/dal/price-alerts";
import { verifyTurnstile } from "@/lib/turnstile";
import { normalizeEmail, hashEmailForRateLimit } from "@/lib/validate-email";
// FIX: price_alerts RLS only permits service_role writes. The public endpoint
// must use the privileged client so inserts/reads are not blocked by RLS.
// The DAL functions already scope by site_id + product_id, so tenant isolation
// is preserved at the application layer.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";

/**
 * POST /api/products/:productId/price-alert
 * Subscribe to a price-drop alert.
 * Body: { email: string, target_price: number, currency?: string, turnstileToken?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;

  // SEC-11: Validate productId format to prevent injection via crafted route params
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Invalid product ID format" }, { status: 400 });
  }

  const ip = getClientIp(request);

  // F-05: IP rate limit
  const rl = await checkRateLimit(`price-alert:${ip}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: { email?: string; target_price?: number; currency?: string; turnstileToken?: string };
  const parsed = await parseJsonBody(request);
  if (parsed instanceof NextResponse) return parsed;
  body = parsed as typeof body;

  const { email, target_price, currency } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!target_price || typeof target_price !== "number" || target_price <= 0) {
    return NextResponse.json({ error: "target_price must be a positive number" }, { status: 400 });
  }

  // F-05: Verify Turnstile CAPTCHA (consistent with comments endpoint)
  const turnstileResult = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: turnstileResult.error || "Captcha verification failed" },
      { status: 403 },
    );
  }

  // F-05: Per-email rate limit to prevent email-bombing via rotating IPs
  const normalizedEmail = normalizeEmail(email);
  const rateLimitEmail = await hashEmailForRateLimit(normalizedEmail);
  const emailRl = await checkRateLimit(`price-alert-email:${rateLimitEmail}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!emailRl.allowed) {
    return NextResponse.json(
      { error: "Too many alerts for this email. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(emailRl.retryAfterMs / 1000)) } },
    );
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    // L1-FIX: Validate productId belongs to this site before creating alert.
    // Without this, an attacker from Site A can subscribe alerts on Site B's products.
    const product = await getProductById(siteId, productId, getPrivilegedSupabaseClient);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if already subscribed — use privileged client + site scope to bypass RLS
    const existing = await getPriceAlert(productId, email, getPrivilegedSupabaseClient, siteId);
    if (existing) {
      return NextResponse.json({
        message: "You already have an active price alert for this product",
        alert: existing,
      });
    }

    // Use privileged client to bypass RLS (price_alerts is service_role only)
    const alert = await createPriceAlert(
      {
        product_id: productId,
        site_id: siteId,
        email,
        target_price,
        currency: currency || "USD",
      },
      getPrivilegedSupabaseClient,
    );

    return NextResponse.json({ message: "Price alert created", alert }, { status: 201 });
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "Failed to create price alert" }, { status: 500 });
  }
}

/**
 * DELETE /api/products/:productId/price-alert
 * Unsubscribe from a price-drop alert.
 * Body: { alert_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  await params; // consume params

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`price-alert-del:${ip}`, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: { alert_id?: string };
  const parsedDel = await parseJsonBody(request);
  if (parsedDel instanceof NextResponse) return parsedDel;
  body = parsedDel as typeof body;

  if (!body.alert_id) {
    return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(body.alert_id)) {
    return NextResponse.json({ error: "Invalid alert_id format" }, { status: 400 });
  }

  try {
    // F-10: Scope delete by site_id to prevent cross-tenant IDOR
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);
    await deactivatePriceAlertScoped(body.alert_id, siteId, getPrivilegedSupabaseClient);
    return NextResponse.json({ message: "Alert deactivated" });
  } catch {
    return NextResponse.json({ error: "Failed to deactivate alert" }, { status: 500 });
  }
}
