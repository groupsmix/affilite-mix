import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createToken, COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

/** 5 login attempts per 15 minutes per IP */
const LOGIN_RATE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const rl = await checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const body = await request.json();
  const { password } = body as { password?: string };

  if (!password) {
    return NextResponse.json(
      { error: "password is required" },
      { status: 400 },
    );
  }

  // Verify Turnstile token (skipped in dev if not configured)
  const turnstile = await verifyTurnstileToken(
    body.turnstileToken ?? null,
    ip,
  );
  if (!turnstile.success) {
    return NextResponse.json(
      { error: turnstile.error ?? "Bot verification failed" },
      { status: 403 },
    );
  }

  if (!verifyCredentials(password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createToken({ role: "admin" });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
