import { NextRequest, NextResponse } from "next/server";
import {
  createToken,
  getAdminBindingCookie,
  touchAdminActivity,
  COOKIE_NAME,
  ACTIVITY_COOKIE,
  BINDING_COOKIE,
} from "@/lib/auth";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import {
  ADMIN_JWT_EXPIRY_SECONDS,
  MAX_SESSION_AGE_ADMIN_SECONDS,
  MAX_SESSION_AGE_REGULAR_SECONDS,
} from "@/lib/auth-constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { getAdminUserById } from "@/lib/dal/admin-users";
import {
  getAdminApiTokenByHash,
  isAdminApiTokenValid,
  touchAdminApiToken,
} from "@/lib/dal/admin-api-tokens";
import { getSiteRowById } from "@/lib/dal/sites";
import { hashSecretToken } from "@/lib/generate-token";
import { getAnonClient } from "@/lib/supabase-server";
import { computeRequestBinding } from "@/lib/jwt-binding";

const TOKEN_LOGIN_IP_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
  graceMs: 0,
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`token-login:${ip}`, TOKEN_LOGIN_IP_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError as { token?: unknown };

  if (typeof body.token !== "string" || !body.token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const tokenHash = await hashSecretToken(body.token);
  const tokenRow = await getAdminApiTokenByHash(tokenHash);

  if (!(await isAdminApiTokenValid(tokenRow))) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const user = await getAdminUserById(tokenRow!.created_by);
  if (!user || !user.is_active) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  try {
    await touchAdminApiToken(tokenRow!.id);
  } catch (err) {
    captureException(err, { context: "[token-login] failed to touch token" });
  }

  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    // Site-scoped tokens pin the session to a single tenant. requireAdmin()
    // rejects any request that resolves to a different site, and the
    // site-switch route refuses to move a scoped session. All-sites tokens
    // (site_id === null) omit the claim and keep full cross-tenant access.
    ...(tokenRow!.site_id ? { site_id: tokenRow!.site_id } : {}),
  };

  const token = await createToken(payload, request);

  const response = NextResponse.json({ ok: true });

  response.cookies.delete(COOKIE_NAME);
  response.cookies.delete(ACTIVITY_COOKIE);
  response.cookies.delete(BINDING_COOKIE);

  const absoluteMaxAge =
    user.role === "super_admin" ? MAX_SESSION_AGE_ADMIN_SECONDS : MAX_SESSION_AGE_REGULAR_SECONDS;
  const cookieMaxAge = Math.min(ADMIN_JWT_EXPIRY_SECONDS, absoluteMaxAge);

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: cookieMaxAge,
  });

  const binding = await computeRequestBinding(request, payload.role);
  if (binding) {
    const bc = getAdminBindingCookie(binding);
    response.cookies.set(
      bc.name,
      bc.value,
      bc.options as Parameters<NextResponse["cookies"]["set"]>[2],
    );
  }

  const activity = await touchAdminActivity();
  response.cookies.set(
    activity.name,
    activity.value,
    activity.options as Parameters<NextResponse["cookies"]["set"]>[2],
  );

  let activeSiteSlug: string | null = null;
  if (tokenRow!.site_id) {
    const site = await getSiteRowById(tokenRow!.site_id, getAnonClient);
    activeSiteSlug = site?.slug ?? null;
  }
  if (!activeSiteSlug) {
    activeSiteSlug = process.env.NEXT_PUBLIC_DEFAULT_SITE ?? null;
  }
  if (activeSiteSlug) {
    response.cookies.set(ACTIVE_SITE_COOKIE, activeSiteSlug, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  await recordAuditEvent({
    site_id: activeSiteSlug ?? "_global",
    actor: user.email,
    actor_user_id: user.id,
    action: "auth.token_login",
    entity_type: "admin_api_token",
    entity_id: tokenRow!.id,
    ip,
    details: { request_id: requestId },
  });

  return response;
}
